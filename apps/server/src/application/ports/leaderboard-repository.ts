import type { LeaderboardRow, Metric } from '@tiklive/contracts';

export interface LeaderboardReader {
  /** Top-N ordered by value desc, then first-seen viewer (lower id) for a stable order. */
  top(
    metric: Metric,
    scopeKey: string,
    limit: number,
    excludedUniqueIds: readonly string[],
  ): Promise<LeaderboardRow[]>;
  /** Room-wide total of a metric in a scope (goals, consistency checks). */
  roomTotal(metric: Metric, scopeKey: string): Promise<number>;
}

export interface LeaderboardWriter {
  /** Deletes per-viewer and room totals of exactly this scope key. Returns rows removed. */
  reset(scopeKey: string): Promise<number>;
}

export type LeaderboardRepository = LeaderboardReader & LeaderboardWriter;
