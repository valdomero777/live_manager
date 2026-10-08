import type { LiveEvent, RawLiveEvent } from '@tiklive/contracts';
import type { Logger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';
import type { EventNormalizer } from './event-normalizer.js';
import type { IngestLiveEvent } from './ingest-live-event.js';
import type { SessionService } from './session-service.js';

export const FLUSH_INTERVAL_MS = 250;

interface PipelineDeps {
  readonly normalizer: EventNormalizer;
  readonly sessions: SessionService;
  readonly ingest: IngestLiveEvent;
  readonly scheduler: Scheduler;
  readonly logger: Logger;
}

/**
 * Single FIFO for every raw event (spec: sequential processing per session), so accumulators
 * never race. Both the real connector and the simulator feed this same path.
 */
export class LiveEventPipeline {
  private chain: Promise<void> = Promise.resolve();
  private stopFlushing: Cancel | undefined;
  private accepting = true;

  constructor(private readonly deps: PipelineDeps) {}

  start(): void {
    this.stopFlushing = this.deps.scheduler.setInterval(
      () => this.enqueue(() => this.ingestAll(this.deps.normalizer.flush())),
      FLUSH_INTERVAL_MS,
    );
  }

  accept(raw: RawLiveEvent, target: string): void {
    if (!this.accepting) return;
    this.enqueue(() => this.process(raw, target));
  }

  /** Waits until everything accepted so far is processed. */
  idle(): Promise<void> {
    return this.chain;
  }

  /** Stops accepting, flushes open streaks/windows and waits for the queue to empty. */
  async drain(): Promise<void> {
    this.accepting = false;
    this.stopFlushing?.();
    this.enqueue(() => this.ingestAll(this.deps.normalizer.flushAll()));
    await this.chain;
  }

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error({ err: message }, 'pipeline task failed');
    });
  }

  private async process(raw: RawLiveEvent, target: string): Promise<void> {
    const sessionId = await this.deps.sessions.ensureActive(target);
    await this.ingestAll(this.deps.normalizer.push(sessionId, raw));
    if (raw.kind === 'streamEnd') await this.deps.sessions.end();
  }

  private async ingestAll(events: readonly LiveEvent[]): Promise<void> {
    for (const event of events) await this.deps.ingest.execute(event);
  }
}
