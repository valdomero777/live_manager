import type { Random } from '../shared/time.js';

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly jitterMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 1_000, maxMs: 30_000, jitterMs: 500 };

/** delay = min(maxDelay, base * 2^attempt) + random(0, jitter) */
export function computeBackoffDelay(
  attempt: number,
  random: Random,
  policy = DEFAULT_BACKOFF,
): number {
  const exponential = policy.baseMs * 2 ** Math.max(0, attempt);
  return Math.min(policy.maxMs, exponential) + random.next() * policy.jitterMs;
}
