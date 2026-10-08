import type { LiveEvent } from '@tiklive/contracts';
import type { MetricDelta } from '../../domain/projections/scopes.js';

/** Projection writes that must commit atomically with the event (spec section 6). */
export interface ProjectionWrites {
  readonly scopeKeys: readonly string[];
  readonly deltas: readonly MetricDelta[];
}

/** Recent events for the dashboard feed (newest first), already validated. */
export interface EventReader {
  recent(sessionId: number, limit: number): Promise<LiveEvent[]>;
}

export interface EventStore {
  /**
   * Persists the event, upserts its viewer and applies leaderboard/room-total deltas in one
   * transaction. Returns false (and writes nothing) when the dedupe key already exists.
   */
  save(event: LiveEvent, writes: ProjectionWrites): Promise<boolean>;
}
