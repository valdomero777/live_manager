import {
  MIN_STREAK_COUNT,
  type GiftEvent,
  type LiveEvent,
  type StreakEntry,
} from '@tiklive/contracts';

function isStreak(gift: GiftEvent): boolean {
  return gift.isStreakFinal && gift.quantity >= MIN_STREAK_COUNT;
}

/**
 * The longest gift streak of the session. The ingest pipeline only delivers a streak once it is
 * closed, so a streak is a consolidated gift of at least MIN_STREAK_COUNT units; single gifts
 * and other events never count. A tie keeps the earlier streak. A new session starts empty.
 */
export class StreakProjection {
  private sessionId: number | undefined;
  private best: StreakEntry | null = null;

  leader(): StreakEntry | null {
    return this.best;
  }

  reset(): void {
    this.best = null;
  }

  /** Returns true when the leader changed (including a session switch that cleared it). */
  apply(event: LiveEvent): boolean {
    let changed = false;
    if (this.sessionId !== undefined && this.sessionId !== event.sessionId) {
      changed = this.best !== null;
      this.best = null;
    }
    this.sessionId = event.sessionId;
    if (event.type !== 'gift' || !isStreak(event)) return changed;
    if (this.best && event.quantity <= this.best.count) return changed;
    this.best = {
      nickname: event.viewer.nickname || event.viewer.uniqueId,
      uniqueId: event.viewer.uniqueId,
      giftName: event.giftName,
      count: event.quantity,
      achievedAt: event.occurredAt,
      ...(event.viewer.avatarUrl ? { avatarUrl: event.viewer.avatarUrl } : {}),
      ...(event.giftImageUrl ? { giftImageUrl: event.giftImageUrl } : {}),
    };
    return true;
  }
}
