import type { LiveEvent, LiveEventType } from '@tiklive/contracts';

/** One row of the event feed, ready to render (no work left for the template). */
export interface FeedItem {
  readonly id: string;
  readonly at: number;
  readonly type: LiveEventType;
  /** @uniqueId, or '' for room events (viewer count, end of live). */
  readonly user: string;
  readonly nickname: string;
  readonly avatarUrl: string | undefined;
  /** What happened, without the user: "envió 5 × Rose". */
  readonly action: string;
  /** Secondary detail: comment text, diamonds, totals. */
  readonly detail: string;
}

function actionOf(e: LiveEvent): string {
  switch (e.type) {
    case 'comment':
      return 'comentó';
    case 'gift':
      return `envió ${e.quantity} × ${e.giftName}`;
    case 'like':
      return `dio ${e.likeDelta.toLocaleString('es')} likes`;
    case 'follow':
      return 'empezó a seguirte';
    case 'join':
      return 'entró al live';
    case 'share':
      return 'compartió el live';
    case 'viewerCount':
      return `${e.viewerCount.toLocaleString('es')} espectadores`;
    case 'streamEnd':
      return 'El live terminó';
  }
}

function detailOf(e: LiveEvent): string {
  switch (e.type) {
    case 'comment':
      return e.text;
    case 'gift':
      return `${(e.diamondValue * e.quantity).toLocaleString('es')} diamantes`;
    case 'like':
      return `Total del live: ${e.totalLikes.toLocaleString('es')}`;
    default:
      return '';
  }
}

export function toFeedItem(e: LiveEvent): FeedItem {
  const viewer = 'viewer' in e ? e.viewer : undefined;
  return {
    id: e.id,
    at: e.occurredAt,
    type: e.type,
    user: viewer ? `@${viewer.uniqueId}` : '',
    nickname: viewer?.nickname || viewer?.uniqueId || '',
    avatarUrl: viewer?.avatarUrl,
    action: actionOf(e),
    detail: detailOf(e),
  };
}

/** Text used for search and screen readers. */
export function feedItemText(item: FeedItem): string {
  return [item.user, item.action, item.detail].filter(Boolean).join(' ');
}

export interface ActivityBucket {
  /** Start of the minute (ms). */
  readonly start: number;
  readonly gifts: number;
  readonly likes: number;
  readonly comments: number;
  readonly social: number;
}

/**
 * Interactions per minute over the last `minutes`, from the events the panel already holds.
 * Every event counts one, so a burst of 500 likes does not hide a single big gift.
 */
export function activityPerMinute(
  events: readonly LiveEvent[],
  now: number,
  minutes = 15,
): ActivityBucket[] {
  const MINUTE = 60_000;
  const end = Math.floor(now / MINUTE) * MINUTE;
  const first = end - (minutes - 1) * MINUTE;
  const buckets = Array.from({ length: minutes }, (_, i) => ({
    start: first + i * MINUTE,
    gifts: 0,
    likes: 0,
    comments: 0,
    social: 0,
  }));
  for (const e of events) {
    const bucket = buckets[Math.floor((e.occurredAt - first) / MINUTE)];
    if (!bucket || e.occurredAt < first) continue;
    if (e.type === 'gift') bucket.gifts += 1;
    else if (e.type === 'like') bucket.likes += 1;
    else if (e.type === 'comment') bucket.comments += 1;
    else if (e.type === 'follow' || e.type === 'share' || e.type === 'join') bucket.social += 1;
  }
  return buckets;
}
