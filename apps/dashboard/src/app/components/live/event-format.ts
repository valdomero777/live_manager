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

const SERIES_OF: Partial<Record<LiveEventType, keyof Omit<ActivityBucket, 'start'>>> = {
  gift: 'gifts',
  like: 'likes',
  comment: 'comments',
  follow: 'social',
  share: 'social',
  join: 'social',
};

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
    // Events stamped slightly in the future (clock skew) count in the current minute.
    const index = Math.min(minutes - 1, Math.floor((e.occurredAt - first) / MINUTE));
    const bucket = e.occurredAt < first ? undefined : buckets[index];
    const series = SERIES_OF[e.type];
    if (bucket && series) bucket[series] += 1;
  }
  return buckets;
}
