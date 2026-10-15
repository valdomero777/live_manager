import {
  FEED_EVENT_TYPES,
  MAX_FEED_ITEMS,
  type FeedItem,
  type FeedEventType,
  type LiveEvent,
} from '@tiklive/contracts';

const KEPT: readonly string[] = FEED_EVENT_TYPES;

function toItem(event: LiveEvent): FeedItem | undefined {
  if (!KEPT.includes(event.type) || !('viewer' in event)) return undefined;
  const base = {
    id: event.id,
    type: event.type as FeedEventType,
    occurredAt: event.occurredAt,
    nickname: event.viewer.nickname || event.viewer.uniqueId,
    uniqueId: event.viewer.uniqueId,
    ...(event.viewer.avatarUrl ? { avatarUrl: event.viewer.avatarUrl } : {}),
  };
  if (event.type !== 'gift') return base;
  return {
    ...base,
    giftName: event.giftName,
    quantity: event.quantity,
    diamonds: event.diamondValue * event.quantity,
    ...(event.giftImageUrl ? { giftImageUrl: event.giftImageUrl } : {}),
  };
}

/**
 * The last gifts, follows, shares and joins of the session, newest first. Only consolidated
 * gifts are listed (a streak appears once). An event id already listed is ignored, and a new
 * session starts an empty list, like the stats.
 */
export class FeedProjection {
  private sessionId: number | undefined;
  private items: readonly FeedItem[] = [];

  snapshot(): readonly FeedItem[] {
    return this.items;
  }

  reset(): void {
    this.items = [];
  }

  /** Returns true when the list changed (including a session switch). */
  apply(event: LiveEvent): boolean {
    const isNewSession = this.sessionId !== undefined && this.sessionId !== event.sessionId;
    if (isNewSession) this.items = [];
    this.sessionId = event.sessionId;
    const item = event.type === 'gift' && !event.isStreakFinal ? undefined : toItem(event);
    if (!item || this.items.some((i) => i.id === item.id)) return isNewSession;
    this.items = [item, ...this.items].slice(0, MAX_FEED_ITEMS);
    return true;
  }
}
