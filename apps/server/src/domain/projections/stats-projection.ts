import type { GiftEvent, LiveEvent, StatsSnapshot } from '@tiklive/contracts';

export type StatsState = Omit<StatsSnapshot, 'seq'>;

const EMPTY: StatsState = {
  sessionId: null,
  startedAt: null,
  viewers: 0,
  peakViewers: 0,
  likes: 0,
  diamonds: 0,
  newFollowers: 0,
  lastGift: null,
  lastFollower: null,
  topGift: null,
};

function giftSummary(gift: GiftEvent) {
  return {
    nickname: gift.viewer.nickname || gift.viewer.uniqueId,
    uniqueId: gift.viewer.uniqueId,
    giftName: gift.giftName,
    quantity: gift.quantity,
    diamonds: gift.diamondValue * gift.quantity,
  };
}

/**
 * In-memory session stats (spec section 11). A new session id resets everything, which also
 * matches "a restart resumes as a new session". apply() returns whether anything changed.
 */
export class StatsProjection {
  private state: StatsState = EMPTY;

  snapshot(): StatsState {
    return this.state;
  }

  startSession(sessionId: number, startedAt: number): void {
    this.state = { ...EMPTY, sessionId, startedAt };
  }

  /** Returns true when the snapshot changed (including a session switch). */
  apply(event: LiveEvent): boolean {
    const isNewSession = this.state.sessionId !== event.sessionId;
    if (isNewSession) this.startSession(event.sessionId, event.occurredAt);
    const next = this.reduce(this.state, event);
    if (next === this.state) return isNewSession;
    this.state = next;
    return true;
  }

  private reduce(s: StatsState, event: LiveEvent): StatsState {
    switch (event.type) {
      case 'viewerCount':
        return {
          ...s,
          viewers: event.viewerCount,
          peakViewers: Math.max(s.peakViewers, event.viewerCount),
        };
      case 'like':
        return { ...s, likes: Math.max(s.likes, event.totalLikes) };
      case 'follow':
        return {
          ...s,
          newFollowers: s.newFollowers + 1,
          lastFollower: {
            nickname: event.viewer.nickname || event.viewer.uniqueId,
            uniqueId: event.viewer.uniqueId,
          },
        };
      case 'gift':
        return event.isStreakFinal ? this.withGift(s, event) : s;
      default:
        return s;
    }
  }

  private withGift(s: StatsState, gift: GiftEvent): StatsState {
    const summary = giftSummary(gift);
    const isTop = s.topGift === null || summary.diamonds > s.topGift.diamonds;
    return {
      ...s,
      diamonds: s.diamonds + summary.diamonds,
      lastGift: summary,
      topGift: isTop ? summary : s.topGift,
    };
  }
}
