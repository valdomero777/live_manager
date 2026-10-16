import type { FeedEventType, FeedItem } from '@tiklive/contracts';
import { formatNumber } from './dom.js';

const ICONS: Readonly<Record<FeedEventType, string>> = {
  gift: '🎁',
  follow: '➕',
  share: '↗',
  join: '👋',
};

export function feedIcon(type: FeedEventType): string {
  return ICONS[type];
}

/** What happened, without the user's name (it has its own element). */
export function feedAction(item: FeedItem): string {
  switch (item.type) {
    case 'gift': {
      const quantity = item.quantity && item.quantity > 1 ? `${item.quantity} × ` : '';
      const name = item.giftName ?? 'un regalo';
      const worth = item.diamonds ? ` (${formatNumber(item.diamonds)} 🪙)` : '';
      return `envió ${quantity}${name}${worth}`;
    }
    case 'follow':
      return 'empezó a seguirte';
    case 'share':
      return 'compartió el directo';
    case 'join':
      return 'entró al directo';
  }
}

/** Items of the wanted types, in the server's order (newest first), cut to `limit`. */
export function selectFeed(
  items: readonly FeedItem[],
  types: readonly FeedEventType[],
  limit: number,
): FeedItem[] {
  return items.filter((i) => types.includes(i.type)).slice(0, limit);
}
