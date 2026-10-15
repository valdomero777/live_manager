import type { FeedItem } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { feedAction, selectFeed } from './feed-format.js';

const item = (over: Partial<FeedItem>): FeedItem => ({
  id: 'e',
  type: 'follow',
  occurredAt: 1,
  nickname: 'Ana',
  uniqueId: 'ana',
  ...over,
});

describe('feed formatting', () => {
  it('describes a gift with quantity and value, and omits what is missing', () => {
    expect(
      feedAction(item({ type: 'gift', giftName: 'Rose', quantity: 3, diamonds: 3 })),
    ).toContain('3 × Rose');
    expect(feedAction(item({ type: 'gift' }))).toBe('envió un regalo');
  });

  it('filters by type and cuts to the limit keeping the newest', () => {
    const items = [
      item({ id: '1', type: 'join' }),
      item({ id: '2' }),
      item({ id: '3', type: 'gift' }),
      item({ id: '4' }),
    ];
    expect(selectFeed(items, ['follow', 'gift'], 2).map((i) => i.id)).toEqual(['2', '3']);
    expect(selectFeed(items, [], 5)).toEqual([]);
  });
});
