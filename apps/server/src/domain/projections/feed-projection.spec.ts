import { MAX_FEED_ITEMS, type FollowEvent } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aViewer } from '../../../test/support/builders.js';
import { FeedProjection } from './feed-projection.js';

const follow = (id: string, sessionId = 1): FollowEvent => ({
  id,
  sessionId,
  occurredAt: 2_000,
  type: 'follow',
  viewer: aViewer({ nickname: 'Ana' }),
});

describe('FeedProjection', () => {
  it('starts empty: nothing is invented', () => {
    expect(new FeedProjection().snapshot()).toEqual([]);
  });

  it('lists newest first with the gift details only on gifts', () => {
    const feed = new FeedProjection();
    expect(feed.apply(follow('f1'))).toBe(true);
    expect(feed.apply(aGiftEvent({ id: 'g1', diamondValue: 5, quantity: 3 }))).toBe(true);
    const [gift, followItem] = feed.snapshot();
    expect(gift).toMatchObject({
      id: 'g1',
      type: 'gift',
      giftName: 'Rose',
      quantity: 3,
      diamonds: 15,
    });
    expect(followItem).toMatchObject({ id: 'f1', type: 'follow', nickname: 'Ana' });
    expect(followItem).not.toHaveProperty('giftName');
  });

  it('ignores a re-delivered event and events it does not list', () => {
    const feed = new FeedProjection();
    feed.apply(follow('f1'));
    expect(feed.apply(follow('f1'))).toBe(false);
    expect(feed.apply(aCommentEvent())).toBe(false);
    expect(feed.apply(aGiftEvent({ id: 'g2', isStreakFinal: false }))).toBe(false);
    expect(feed.snapshot()).toHaveLength(1);
  });

  it('keeps only the most recent items', () => {
    const feed = new FeedProjection();
    for (let i = 0; i < MAX_FEED_ITEMS + 5; i++) feed.apply(follow(`f${i}`));
    expect(feed.snapshot()).toHaveLength(MAX_FEED_ITEMS);
    expect(feed.snapshot()[0]?.id).toBe(`f${MAX_FEED_ITEMS + 4}`);
  });

  it('starts a fresh list in a new session', () => {
    const feed = new FeedProjection();
    feed.apply(follow('f1', 1));
    expect(feed.apply(aCommentEvent({ sessionId: 2 }))).toBe(true);
    expect(feed.snapshot()).toEqual([]);
  });
});
