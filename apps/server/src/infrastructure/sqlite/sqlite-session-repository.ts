import type { Kysely } from 'kysely';
import type {
  LiveSessionRecord,
  SessionRepository,
} from '../../application/ports/session-repository.js';
import type { Database } from './schema.js';

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async start(tiktokUser: string, startedAt: number): Promise<LiveSessionRecord> {
    const row = await this.db
      .insertInto('live_session')
      .values({ tiktok_user: tiktokUser, started_at: startedAt, ended_at: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id, tiktokUser, startedAt };
  }

  async end(sessionId: number, endedAt: number): Promise<void> {
    await this.db
      .updateTable('live_session')
      .set({ ended_at: endedAt })
      .where('id', '=', sessionId)
      .where('ended_at', 'is', null)
      .execute();
  }

  async closeDangling(endedAt: number): Promise<number> {
    const result = await this.db
      .updateTable('live_session')
      .set({ ended_at: endedAt })
      .where('ended_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}
