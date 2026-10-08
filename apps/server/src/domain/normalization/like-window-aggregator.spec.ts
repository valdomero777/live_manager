import { describe, expect, it } from 'vitest';
import { aRawLike, aViewer } from '../../../test/support/builders.js';
import { FakeClock } from '../shared/time.js';
import { LIKE_WINDOW_MS, LikeWindowAggregator } from './like-window-aggregator.js';

function setup() {
  const clock = new FakeClock(0);
  return { clock, likes: new LikeWindowAggregator(clock) };
}

describe('LikeWindowAggregator', () => {
  it('given several packets within a second, when the window closes, then emits their sum', () => {
    const { clock, likes } = setup();
    likes.ingest(1, aRawLike({ likeCount: 5 }));
    likes.ingest(1, aRawLike({ likeCount: 7 }));
    expect(likes.flushDue()).toEqual([]);

    clock.advance(LIKE_WINDOW_MS);
    const out = likes.flushDue();
    expect(out).toHaveLength(1);
    expect(out[0]?.likeDelta).toBe(12);
  });

  it('given packets from two viewers, when flushed, then each viewer gets its own event', () => {
    const { likes } = setup();
    likes.ingest(1, aRawLike({ viewer: aViewer({ tiktokUserId: 'a' }), likeCount: 1 }));
    likes.ingest(1, aRawLike({ viewer: aViewer({ tiktokUserId: 'b' }), likeCount: 2 }));
    expect(likes.flushAll().map((l) => l.likeDelta)).toEqual([1, 2]);
  });

  it('given a reported total that goes backwards, when tracked, then the total stays monotonic', () => {
    const { likes } = setup();
    likes.ingest(1, aRawLike({ likeCount: 5, totalLikes: 100 }));
    likes.ingest(1, aRawLike({ likeCount: 5, totalLikes: 90 }));
    expect(likes.totalFor(1)).toBe(100);
    expect(likes.flushAll()[0]?.totalLikes).toBe(100);
  });

  it('given no reported total, when tracked, then the total is the running sum', () => {
    const { likes } = setup();
    likes.ingest(1, aRawLike({ likeCount: 3 }));
    likes.ingest(1, aRawLike({ likeCount: 4 }));
    expect(likes.totalFor(1)).toBe(7);
  });

  it('given a zero-count packet, when flushed, then no event is emitted', () => {
    const { likes } = setup();
    likes.ingest(1, aRawLike({ likeCount: 0 }));
    expect(likes.flushAll()).toEqual([]);
  });
});
