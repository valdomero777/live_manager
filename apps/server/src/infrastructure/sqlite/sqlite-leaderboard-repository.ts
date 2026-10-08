import type { LeaderboardRow, Metric } from '@tiklive/contracts';
import type { Kysely } from 'kysely';
import type { LeaderboardRepository } from '../../application/ports/leaderboard-repository.js';
import type { Database } from './schema.js';

/** Top-N over ix_lb_rank; ties broken by viewer id so every client sees the same order. */
export class SqliteLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async top(
    metric: Metric,
    scopeKey: string,
    limit: number,
    excludedUniqueIds: readonly string[],
  ): Promise<LeaderboardRow[]> {
    let query = this.db
      .selectFrom('leaderboard_total as t')
      .innerJoin('viewer as v', 'v.id', 't.viewer_id')
      .select(['v.id', 'v.unique_id', 'v.nickname', 'v.avatar_url', 't.value'])
      .where('t.scope', '=', scopeKey)
      .where('t.metric', '=', metric)
      .where('t.value', '>', 0);
    if (excludedUniqueIds.length > 0)
      query = query.where('v.unique_id', 'not in', [...excludedUniqueIds]);
    const rows = await query
      .orderBy('t.value', 'desc')
      .orderBy('v.id', 'asc')
      .limit(limit)
      .execute();
    return rows.map((r, i) => ({
      rank: i + 1,
      viewerId: r.id,
      uniqueId: r.unique_id,
      nickname: r.nickname || r.unique_id,
      value: r.value,
      ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    }));
  }

  async roomTotal(metric: Metric, scopeKey: string): Promise<number> {
    const row = await this.db
      .selectFrom('metric_total')
      .select('value')
      .where('scope', '=', scopeKey)
      .where('metric', '=', metric)
      .executeTakeFirst();
    return row?.value ?? 0;
  }

  reset(scopeKey: string): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const viewers = await trx
        .deleteFrom('leaderboard_total')
        .where('scope', '=', scopeKey)
        .executeTakeFirst();
      await trx.deleteFrom('metric_total').where('scope', '=', scopeKey).execute();
      await trx.deleteFrom('goal_cycle').where('scope_key', '=', scopeKey).execute();
      return Number(viewers.numDeletedRows);
    });
  }
}
