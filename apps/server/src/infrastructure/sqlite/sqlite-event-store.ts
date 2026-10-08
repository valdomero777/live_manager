import { LiveEventSchema, type LiveEvent, type ViewerRef } from '@tiklive/contracts';
import type BetterSqlite3 from 'better-sqlite3';
import type {
  EventReader,
  EventStore,
  ProjectionWrites,
} from '../../application/ports/event-store.js';

const bool = (b: boolean) => (b ? 1 : 0);

const SQL = {
  upsertViewer: `
    INSERT INTO viewer (tiktok_user_id, unique_id, nickname, avatar_url, is_follower, is_subscriber, is_moderator, updated_at)
    VALUES (@tiktokUserId, @uniqueId, @nickname, @avatarUrl, @isFollower, @isSubscriber, @isModerator, @now)
    ON CONFLICT (tiktok_user_id) DO UPDATE SET
      unique_id = excluded.unique_id, nickname = excluded.nickname, avatar_url = excluded.avatar_url,
      is_follower = excluded.is_follower, is_subscriber = excluded.is_subscriber,
      is_moderator = excluded.is_moderator, updated_at = excluded.updated_at
    RETURNING id`,
  insertEvent: `
    INSERT INTO live_event (event_uid, session_id, viewer_id, type, payload, dedupe_key, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING`,
  addRoomTotal: `
    INSERT INTO metric_total (scope, metric, value) VALUES (?, ?, ?)
    ON CONFLICT (scope, metric) DO UPDATE SET value = value + excluded.value`,
  addViewerTotal: `
    INSERT INTO leaderboard_total (viewer_id, scope, metric, value) VALUES (?, ?, ?, ?)
    ON CONFLICT (viewer_id, scope, metric) DO UPDATE SET value = value + excluded.value`,
};

/** Upserts a viewer (alias, nickname, roles change over time) and returns its row id. */
function viewerUpserter(
  sqlite: BetterSqlite3.Database,
): (viewer: ViewerRef, now: number) => number {
  const upsert = sqlite.prepare<Record<string, unknown>, { id: number }>(SQL.upsertViewer);
  return (viewer, now) => {
    const row = upsert.get({
      ...viewer,
      avatarUrl: viewer.avatarUrl ?? null,
      isFollower: bool(viewer.isFollower),
      isSubscriber: bool(viewer.isSubscriber),
      isModerator: bool(viewer.isModerator),
      now,
    });
    if (!row) throw new Error('viewer upsert returned no id');
    return row.id;
  };
}

/**
 * The ingest hot path. Uses prepared better-sqlite3 statements in one synchronous transaction
 * instead of Kysely: about a dozen statements per event must sustain 1000 events/s on an old
 * laptop (ADR 0009). Event, viewer and leaderboard/room deltas commit atomically (spec 6).
 */
export class SqliteEventStore implements EventStore, EventReader {
  private readonly saveTx: (event: LiveEvent, writes: ProjectionWrites) => boolean;
  private readonly recentStmt: BetterSqlite3.Statement<[number, number], { payload: string }>;

  constructor(sqlite: BetterSqlite3.Database) {
    const insertEvent = sqlite.prepare(SQL.insertEvent);
    const addRoomTotal = sqlite.prepare(SQL.addRoomTotal);
    const addViewerTotal = sqlite.prepare(SQL.addViewerTotal);
    this.recentStmt = sqlite.prepare(
      'SELECT payload FROM live_event WHERE session_id = ? ORDER BY id DESC LIMIT ?',
    );

    const viewerIdOf = viewerUpserter(sqlite);

    this.saveTx = sqlite.transaction((event: LiveEvent, writes: ProjectionWrites): boolean => {
      const viewerId = 'viewer' in event ? viewerIdOf(event.viewer, event.occurredAt) : null;
      const inserted = insertEvent.run(
        event.id,
        event.sessionId,
        viewerId,
        event.type,
        JSON.stringify(event),
        event.dedupeKey ?? null,
        event.occurredAt,
      );
      if (inserted.changes === 0) return false;
      for (const scope of writes.scopeKeys) {
        for (const { metric, amount } of writes.deltas) {
          addRoomTotal.run(scope, metric, amount);
          if (viewerId !== null) addViewerTotal.run(viewerId, scope, metric, amount);
        }
      }
      return true;
    });
  }

  /** Payloads are re-validated on read: no unvalidated JSON enters the app (spec 6). */
  recent(sessionId: number, limit: number): Promise<LiveEvent[]> {
    const rows = this.recentStmt.all(sessionId, limit);
    return Promise.resolve(
      rows.flatMap((r) => {
        const parsed = LiveEventSchema.safeParse(JSON.parse(r.payload));
        return parsed.success ? [parsed.data] : [];
      }),
    );
  }

  save(event: LiveEvent, writes: ProjectionWrites): Promise<boolean> {
    try {
      return Promise.resolve(this.saveTx(event, writes));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
