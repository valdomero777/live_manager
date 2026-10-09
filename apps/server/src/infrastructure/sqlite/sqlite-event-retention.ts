import type BetterSqlite3 from 'better-sqlite3';
import type { EventRetention } from '../../application/ports/backup-store.js';

const CHUNK = 5_000;

/**
 * Deletes in small chunks and yields between them, so a big purge never blocks the event loop
 * (and the writes of a live in progress) for long. Viewers and totals are not touched.
 */
export class SqliteEventRetention implements EventRetention {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  async purgeEventsBefore(timestamp: number): Promise<number> {
    const statement = this.sqlite.prepare(
      'DELETE FROM live_event WHERE id IN (SELECT id FROM live_event WHERE occurred_at < ? LIMIT ?)',
    );
    let total = 0;
    for (;;) {
      const { changes } = statement.run(timestamp, CHUNK);
      total += changes;
      if (changes < CHUNK) return total;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}
