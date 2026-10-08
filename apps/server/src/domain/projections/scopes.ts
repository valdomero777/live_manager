import type { GoalMetric, LiveEvent, Metric, Scope } from '@tiklive/contracts';

export interface MetricDelta {
  readonly metric: Metric;
  readonly amount: number;
}

const DAY_MS = 86_400_000;

/** ISO-8601 week key in UTC, e.g. "2026-41" (the week containing that year's first Thursday). */
export function isoWeekKey(epochMs: number): string {
  const date = new Date(epochMs);
  const day = date.getUTCDay() || 7;
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-${String(week).padStart(2, '0')}`;
}

/** Concrete scope key stored in leaderboard_total.scope (spec section 11). */
export function scopeKey(scope: Scope, sessionId: number, now: number): string {
  if (scope === 'session') return `session:${sessionId}`;
  if (scope === 'week') return `week:${isoWeekKey(now)}`;
  return 'total';
}

/** Every scope key an event contributes to. */
export function scopeKeysFor(event: LiveEvent): string[] {
  return (['session', 'week', 'total'] as const).map((s) =>
    scopeKey(s, event.sessionId, event.occurredAt),
  );
}

/**
 * What an event adds to each metric. Only final gifts count, so a streak is summed once;
 * likes use the per-viewer delta so the ranking equals the likes received.
 */
export function metricDeltas(event: LiveEvent): MetricDelta[] {
  if (event.type === 'gift' && event.isStreakFinal) {
    return [
      { metric: 'diamonds', amount: event.diamondValue * event.quantity },
      { metric: 'gift_count', amount: event.quantity },
    ];
  }
  if (event.type === 'like' && event.likeDelta > 0) {
    return [{ metric: 'likes', amount: event.likeDelta }];
  }
  return [];
}

const GOAL_TO_METRIC: Readonly<Record<GoalMetric, Metric>> = {
  diamonds: 'diamonds',
  gifts: 'gift_count',
  likes: 'likes',
};

export function goalMetricToMetric(metric: GoalMetric): Metric {
  return GOAL_TO_METRIC[metric];
}
