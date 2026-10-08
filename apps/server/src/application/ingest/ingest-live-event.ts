import type { LiveEvent } from '@tiklive/contracts';
import type { AdminNotifier } from '../ports/admin-notifier.js';
import { metricDeltas, scopeKeysFor } from '../../domain/projections/scopes.js';
import type { EventStore } from '../ports/event-store.js';
import type { Logger } from '../ports/logger.js';

/** Anything that reacts to an accepted event (rule engine, projections). */
export interface LiveEventConsumer {
  handle(event: LiveEvent): Promise<void> | void;
}

interface IngestDeps {
  readonly events: EventStore;
  readonly consumers: readonly LiveEventConsumer[];
  readonly notifier: AdminNotifier;
  readonly logger: Logger;
}

/**
 * Persists an accepted event together with its leaderboard deltas (one transaction, so the
 * ranking and the log never diverge), then fans it out. Consumer failures are isolated.
 */
export class IngestLiveEvent {
  constructor(private readonly deps: IngestDeps) {}

  async execute(event: LiveEvent): Promise<boolean> {
    const writes = { scopeKeys: scopeKeysFor(event), deltas: metricDeltas(event) };
    const isNew = await this.deps.events.save(event, writes);
    if (!isNew) {
      this.deps.logger.debug({ eventId: event.id }, 'duplicate event ignored');
      return false;
    }
    this.deps.notifier.publish('event.received', event);
    for (const consumer of this.deps.consumers) {
      await this.runConsumer(consumer, event);
    }
    return true;
  }

  private async runConsumer(consumer: LiveEventConsumer, event: LiveEvent): Promise<void> {
    try {
      await consumer.handle(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error({ eventId: event.id, err: message }, 'event consumer failed');
      this.deps.notifier.publish('error.reported', { module: 'ingest', message });
    }
  }
}
