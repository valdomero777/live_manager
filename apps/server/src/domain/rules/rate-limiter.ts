import type { Clock, Random } from '../shared/time.js';

export interface RateLimitPolicy {
  readonly ruleId: number;
  readonly cooldownMs: number;
  readonly userCooldownMs: number;
  readonly probability: number;
}

export type LimitDecision = 'allowed' | 'global_cooldown' | 'user_cooldown' | 'probability';

/**
 * Global cooldown keyed by ruleId and per-user cooldown keyed by ruleId:viewerId.
 * State is in memory only; losing it on restart is acceptable by design.
 */
export class RuleRateLimiter {
  private readonly lastGlobal = new Map<number, number>();
  private readonly lastPerUser = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  /** Checks and, when allowed, records the execution atomically. */
  tryAcquire(policy: RateLimitPolicy, viewerId: string | undefined): LimitDecision {
    const now = this.clock.now();
    const userKey = viewerId === undefined ? undefined : `${policy.ruleId}:${viewerId}`;

    if (this.isCooling(this.lastGlobal.get(policy.ruleId), policy.cooldownMs, now)) {
      return 'global_cooldown';
    }
    if (userKey && this.isCooling(this.lastPerUser.get(userKey), policy.userCooldownMs, now)) {
      return 'user_cooldown';
    }
    if (policy.probability < 1 && this.random.next() >= policy.probability) return 'probability';

    this.lastGlobal.set(policy.ruleId, now);
    if (userKey) this.lastPerUser.set(userKey, now);
    return 'allowed';
  }

  /** Drops state for a rule, e.g. after it was edited. */
  forget(ruleId: number): void {
    this.lastGlobal.delete(ruleId);
    const prefix = `${ruleId}:`;
    for (const key of this.lastPerUser.keys()) {
      if (key.startsWith(prefix)) this.lastPerUser.delete(key);
    }
  }

  private isCooling(last: number | undefined, cooldownMs: number, now: number): boolean {
    return cooldownMs > 0 && last !== undefined && now - last < cooldownMs;
  }
}
