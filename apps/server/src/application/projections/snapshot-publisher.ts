import {
  METRICS,
  MAX_LEADERBOARD_LIMIT,
  MetricSchema,
  SCOPES,
  ScopeSchema,
  makeEnvelope,
  type LiveEvent,
  type ScreenServerMessage,
} from '@tiklive/contracts';
import { metricDeltas } from '../../domain/projections/scopes.js';
import type { StatsProjection } from '../../domain/projections/stats-projection.js';
import type { Clock } from '../../domain/shared/time.js';
import type { LiveEventConsumer } from '../ingest/ingest-live-event.js';
import type { ChannelGateway } from '../ports/channel-gateway.js';
import type { Logger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';
import type { SocketConnection } from '../ports/socket-connection.js';
import type { GoalService } from './goal-service.js';
import type { LeaderboardService } from './leaderboard-service.js';

/** Snapshots per channel are coalesced: at most one every 250 ms (spec 11). */
export const SNAPSHOT_DEBOUNCE_MS = 250;

interface PublisherDeps {
  readonly gateway: ChannelGateway;
  readonly leaderboards: LeaderboardService;
  readonly goals: GoalService;
  readonly stats: StatsProjection;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly logger: Logger;
}

const leaderboardChannels = (metric: string) => SCOPES.map((s) => `leaderboard:${metric}:${s}`);

/**
 * Keeps leaderboard, goal and stats projections current and pushes snapshots to subscribed
 * overlays. Overlays are dumb clients: they never query the database (ADR 0005).
 */
export class SnapshotPublisher implements LiveEventConsumer {
  private readonly seqs = new Map<string, number>();
  private readonly pending = new Map<string, Cancel>();

  constructor(private readonly deps: PublisherDeps) {}

  async handle(event: LiveEvent): Promise<void> {
    if (this.deps.stats.apply(event)) this.markDirty('stats');
    const metrics = metricDeltas(event).map((d) => d.metric);
    if (metrics.length === 0) return;
    this.deps.leaderboards.invalidate(metrics);
    metrics.flatMap(leaderboardChannels).forEach((c) => this.markDirty(c));
    const goalIds = await this.deps.goals.evaluate(event, metrics);
    goalIds.forEach((id) => this.markDirty(`goal:${id}`));
  }

  /** A new session (or a reset) changes every session-scoped view. */
  refreshAll(): void {
    this.deps.leaderboards.invalidateAll();
    METRICS.flatMap(leaderboardChannels).forEach((c) => this.markDirty(c));
    this.deps.goals.list().forEach((g) => this.markDirty(`goal:${g.id}`));
    this.markDirty('stats');
  }

  markDirty(channel: string): void {
    if (this.pending.has(channel)) return;
    const cancel = this.deps.scheduler.setTimeout(() => {
      this.pending.delete(channel);
      void this.flush(channel);
    }, SNAPSHOT_DEBOUNCE_MS);
    this.pending.set(channel, cancel);
  }

  /** Full snapshot right after client.hello, before any delta (spec 7). */
  async sendInitial(connection: SocketConnection, channels: readonly string[]): Promise<void> {
    for (const channel of channels) {
      const message = await this.build(channel);
      if (message) connection.send(JSON.stringify(message));
    }
  }

  dispose(): void {
    this.pending.forEach((cancel) => cancel());
    this.pending.clear();
  }

  private async flush(channel: string): Promise<void> {
    if (!this.deps.gateway.hasSubscribers(channel)) return;
    try {
      const message = await this.build(channel);
      if (message) this.deps.gateway.publish(channel, message);
    } catch (error) {
      this.deps.logger.error({ channel, err: String(error) }, 'snapshot build failed');
    }
  }

  private nextSeq(channel: string): number {
    const seq = (this.seqs.get(channel) ?? 0) + 1;
    this.seqs.set(channel, seq);
    return seq;
  }

  private async build(channel: string): Promise<ScreenServerMessage | undefined> {
    const [kind, a, b] = channel.split(':');
    const now = this.deps.clock.now();
    if (kind === 'stats') {
      const payload = { ...this.deps.stats.snapshot(), seq: this.nextSeq(channel) };
      return makeEnvelope('stats.snapshot', payload, now);
    }
    if (kind === 'goal') {
      const progress = await this.deps.goals.progress(Number(a));
      if (!progress) return undefined;
      return makeEnvelope('goal.progress', { ...progress, seq: this.nextSeq(channel) }, now);
    }
    const metric = MetricSchema.safeParse(a);
    const scope = ScopeSchema.safeParse(b);
    if (kind !== 'leaderboard' || !metric.success || !scope.success) return undefined;
    const rows = await this.deps.leaderboards.top(metric.data, scope.data, MAX_LEADERBOARD_LIMIT);
    const payload = { metric: metric.data, scope: scope.data, seq: this.nextSeq(channel), rows };
    return makeEnvelope('leaderboard.snapshot', payload, now);
  }
}
