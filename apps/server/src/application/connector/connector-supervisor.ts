import type { ConnectorState, ConnectorStatus } from '@tiklive/contracts';
import {
  computeBackoffDelay,
  type BackoffPolicy,
  DEFAULT_BACKOFF,
} from '../../domain/connector/backoff.js';
import { assertTransition } from '../../domain/connector/connector-state.js';
import type { Clock, Random } from '../../domain/shared/time.js';
import {
  ConnectFailure,
  type LiveEventSource,
  type Unsubscribe,
} from '../ports/live-event-source.js';
import type { Logger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';

export interface SupervisorOptions {
  readonly backoff: BackoffPolicy;
  readonly hostOfflineRetryMs: number;
  readonly stableAfterMs: number;
  readonly maxProtocolRetries: number;
}

export const DEFAULT_SUPERVISOR_OPTIONS: SupervisorOptions = {
  backoff: DEFAULT_BACKOFF,
  hostOfflineRetryMs: 30_000,
  stableAfterMs: 60_000,
  maxProtocolRetries: 5,
};

interface SupervisorDeps {
  readonly source: LiveEventSource;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly random: Random;
  readonly logger: Logger;
  readonly options?: Partial<SupervisorOptions>;
}

/**
 * Drives the connector state machine (spec section 8): single attempts through the
 * LiveEventSource port, exponential backoff with jitter, slow polling while the host is offline.
 */
export class ConnectorSupervisor {
  private state: ConnectorState = 'idle';
  private target: string | undefined;
  private attempt = 0;
  private protocolFailures = 0;
  private lastError: string | undefined;
  private nextRetryAt: number | undefined;
  private generation = 0;
  private pendingTimer: Cancel | undefined;
  private readonly listeners = new Set<(status: ConnectorStatus) => void>();
  private readonly options: SupervisorOptions;
  private readonly unsubscribeDisconnect: Unsubscribe;

  constructor(private readonly deps: SupervisorDeps) {
    this.options = { ...DEFAULT_SUPERVISOR_OPTIONS, ...deps.options };
    this.unsubscribeDisconnect = deps.source.onDisconnect((reason) => this.handleDrop(reason));
  }

  status(): ConnectorStatus {
    return {
      state: this.state,
      attempt: this.attempt,
      ...(this.target === undefined ? {} : { target: this.target }),
      ...(this.nextRetryAt === undefined ? {} : { nextRetryAt: this.nextRetryAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  onStatus(listener: (status: ConnectorStatus) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(target: string): Promise<void> {
    if (this.state !== 'idle') await this.stop();
    this.target = target;
    this.attempt = 0;
    this.protocolFailures = 0;
    this.lastError = undefined;
    await this.attemptConnect(this.generation);
  }

  async stop(): Promise<void> {
    this.generation++;
    this.cancelTimer();
    this.nextRetryAt = undefined;
    if (this.state !== 'idle') this.transition('stopped');
    await this.deps.source.stop().catch((error: unknown) => {
      this.deps.logger.warn({ err: describe(error) }, 'source stop failed');
    });
    this.transition('idle');
  }

  dispose(): void {
    this.unsubscribeDisconnect();
    this.cancelTimer();
  }

  private async attemptConnect(generation: number): Promise<void> {
    const target = this.target;
    if (target === undefined || generation !== this.generation) return;
    this.nextRetryAt = undefined;
    this.transition('connecting');
    try {
      await this.deps.source.start(target);
      if (generation !== this.generation) return;
      this.onConnected(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.onFailure(error, generation);
    }
  }

  private onConnected(generation: number): void {
    this.lastError = undefined;
    this.transition('connected');
    this.deps.logger.info({ target: this.target }, 'connector connected');
    this.schedule(
      () => {
        this.attempt = 0;
        this.protocolFailures = 0;
        this.emit();
      },
      this.options.stableAfterMs,
      generation,
      false,
    );
  }

  private onFailure(error: unknown, generation: number): void {
    const failure =
      error instanceof ConnectFailure ? error : new ConnectFailure('network', describe(error));
    this.lastError = failure.message;
    this.deps.logger.warn({ kind: failure.kind, err: failure.message }, 'connect attempt failed');

    if (failure.kind === 'cancelled') {
      this.transition('stopped');
      return;
    }
    if (failure.kind === 'host_offline') {
      this.transition('waiting_host');
      this.scheduleRetry(this.options.hostOfflineRetryMs, generation);
      return;
    }
    if (failure.kind === 'protocol' && ++this.protocolFailures > this.options.maxProtocolRetries) {
      this.deps.logger.error({ err: failure.message }, 'protocol failures exhausted, stopping');
      this.transition('stopped');
      return;
    }
    this.backoffAndRetry(generation);
  }

  private handleDrop(reason: string): void {
    if (this.state !== 'connected') return;
    this.lastError = reason;
    this.deps.logger.warn({ reason }, 'connection dropped');
    this.cancelTimer();
    this.backoffAndRetry(this.generation);
  }

  private backoffAndRetry(generation: number): void {
    const delay = computeBackoffDelay(this.attempt, this.deps.random, this.options.backoff);
    this.attempt++;
    this.transition('reconnecting', false);
    this.scheduleRetry(delay, generation);
  }

  private scheduleRetry(delayMs: number, generation: number): void {
    this.nextRetryAt = Math.round(this.deps.clock.now() + delayMs);
    this.emit();
    this.schedule(() => void this.attemptConnect(generation), delayMs, generation, true);
  }

  private schedule(fn: () => void, ms: number, generation: number, clearsRetry: boolean): void {
    this.cancelTimer();
    this.pendingTimer = this.deps.scheduler.setTimeout(() => {
      this.pendingTimer = undefined;
      if (generation !== this.generation) return;
      if (clearsRetry) this.nextRetryAt = undefined;
      fn();
    }, ms);
  }

  private cancelTimer(): void {
    this.pendingTimer?.();
    this.pendingTimer = undefined;
  }

  private transition(to: ConnectorState, notify = true): void {
    if (this.state === to && to !== 'stopped') return;
    assertTransition(this.state, to);
    this.state = to;
    if (notify) this.emit();
  }

  private emit(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
