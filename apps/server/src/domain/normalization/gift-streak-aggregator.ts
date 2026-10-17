import type { RawGift } from '@tiklive/contracts';
import type { Clock } from '../shared/time.js';

export const STREAK_IDLE_MS = 3_000;
/**
 * TikTok sends the closing message of a streak (repeatEnd) some seconds after the last count.
 * A closing message with the same quantity as a streak we already closed by idle is that tail.
 */
export const LATE_END_WINDOW_MS = 30_000;

/** A gift whose quantity is final: either non-streakable or a closed streak. */
export interface ConsolidatedGift {
  readonly sessionId: number;
  readonly gift: RawGift;
}

interface OpenStreak {
  readonly sessionId: number;
  readonly last: RawGift;
  readonly updatedAt: number;
}

/**
 * Collapses TikTok gift streaks (repeated messages with growing repeatCount) into a single
 * final gift. A streak closes on its end signal, when idle for `idleMs`, or when a new streak
 * of the same gift restarts the count.
 */
export class GiftStreakAggregator {
  private readonly open = new Map<string, OpenStreak>();
  /** Streaks closed by idle: key -> final quantity and when, to recognise their late end signal. */
  private readonly closedByIdle = new Map<string, { quantity: number; at: number }>();

  constructor(
    private readonly clock: Clock,
    private readonly idleMs = STREAK_IDLE_MS,
  ) {}

  ingest(sessionId: number, gift: RawGift): ConsolidatedGift[] {
    if (!gift.streakable) return [{ sessionId, gift }];

    const key = `${sessionId}:${gift.viewer.tiktokUserId}:${gift.giftId}`;
    if (this.isLateEnd(key, gift)) return [];
    this.closedByIdle.delete(key);
    const out = this.closeIfRestarted(key, gift);
    this.open.set(key, { sessionId, last: gift, updatedAt: this.clock.now() });
    if (gift.streakEnded) out.push(this.close(key));
    return out;
  }

  /** Closes streaks with no updates for `idleMs`. Called periodically by a timer. */
  flushIdle(): ConsolidatedGift[] {
    const now = this.clock.now();
    const out: ConsolidatedGift[] = [];
    for (const [key, streak] of this.open) {
      if (now - streak.updatedAt < this.idleMs) continue;
      out.push(this.close(key));
      this.closedByIdle.set(key, { quantity: streak.last.quantity, at: now });
    }
    this.forgetOldClosures(now);
    return out;
  }

  /** Closes every open streak (shutdown, end of stream). */
  flushAll(): ConsolidatedGift[] {
    return [...this.open.keys()].map((key) => this.close(key));
  }

  get openCount(): number {
    return this.open.size;
  }

  /** The end signal of a streak that idle already emitted: counting it again would double it. */
  private isLateEnd(key: string, gift: RawGift): boolean {
    const closed = this.closedByIdle.get(key);
    if (!closed || this.open.has(key)) return false;
    const recent = this.clock.now() - closed.at <= LATE_END_WINDOW_MS;
    return recent && gift.streakEnded && gift.quantity === closed.quantity;
  }

  private forgetOldClosures(now: number): void {
    for (const [key, closed] of this.closedByIdle) {
      if (now - closed.at > LATE_END_WINDOW_MS) this.closedByIdle.delete(key);
    }
  }

  private closeIfRestarted(key: string, gift: RawGift): ConsolidatedGift[] {
    const current = this.open.get(key);
    if (current && gift.quantity < current.last.quantity) return [this.close(key)];
    return [];
  }

  private close(key: string): ConsolidatedGift {
    const streak = this.open.get(key);
    if (!streak) throw new Error(`No open streak for ${key}`);
    this.open.delete(key);
    return { sessionId: streak.sessionId, gift: { ...streak.last, streakEnded: true } };
  }
}
