import type { Clock } from '../shared/time.js';

export const BREAKER_FAILURE_LIMIT = 5;
export const BREAKER_OPEN_MS = 60_000;

/**
 * Per-key circuit breaker (spec 16): after 5 failures in a row the key is skipped for a minute,
 * then one call is let through; a success closes it again.
 */
export class CircuitBreaker {
  private readonly state = new Map<string, { failures: number; openUntil: number }>();

  constructor(private readonly clock: Clock) {}

  canCall(key: string): boolean {
    const entry = this.state.get(key);
    if (!entry || entry.failures < BREAKER_FAILURE_LIMIT) return true;
    return this.clock.now() >= entry.openUntil;
  }

  recordSuccess(key: string): void {
    this.state.delete(key);
  }

  recordFailure(key: string): void {
    const failures = (this.state.get(key)?.failures ?? 0) + 1;
    const openUntil = this.clock.now() + BREAKER_OPEN_MS;
    this.state.set(key, { failures, openUntil });
  }
}
