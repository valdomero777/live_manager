import { describe, expect, it } from 'vitest';
import { aRawGift, aViewer } from '../../../test/support/builders.js';
import { FakeClock } from '../shared/time.js';
import { GiftStreakAggregator, STREAK_IDLE_MS } from './gift-streak-aggregator.js';

function setup() {
  const clock = new FakeClock(0);
  return { clock, aggregator: new GiftStreakAggregator(clock) };
}

describe('GiftStreakAggregator', () => {
  it('given a streak of 10 gifts, when it ends, then emits one gift with quantity 10 (RF-03)', () => {
    const { aggregator } = setup();
    const out = Array.from({ length: 10 }, (_, i) =>
      aggregator.ingest(1, aRawGift({ quantity: i + 1, streakEnded: i === 9 })),
    ).flat();

    expect(out).toHaveLength(1);
    expect(out[0]?.gift.quantity).toBe(10);
    expect(out[0]?.gift.streakEnded).toBe(true);
    expect(aggregator.openCount).toBe(0);
  });

  it('given a non-streakable gift, when ingested, then emits immediately', () => {
    const { aggregator } = setup();
    const out = aggregator.ingest(1, aRawGift({ streakable: false, quantity: 3 }));
    expect(out).toEqual([{ sessionId: 1, gift: expect.objectContaining({ quantity: 3 }) }]);
  });

  it('given a streak without end signal, when idle 3s, then flushes the final quantity', () => {
    const { aggregator, clock } = setup();
    aggregator.ingest(1, aRawGift({ quantity: 1 }));
    aggregator.ingest(1, aRawGift({ quantity: 4 }));

    clock.advance(STREAK_IDLE_MS - 1);
    expect(aggregator.flushIdle()).toEqual([]);

    clock.advance(1);
    const out = aggregator.flushIdle();
    expect(out.map((g) => g.gift.quantity)).toEqual([4]);
  });

  it('given an update during the streak, when checked, then the idle timer restarts', () => {
    const { aggregator, clock } = setup();
    aggregator.ingest(1, aRawGift({ quantity: 1 }));
    clock.advance(2_000);
    aggregator.ingest(1, aRawGift({ quantity: 2 }));
    clock.advance(2_000);
    expect(aggregator.flushIdle()).toEqual([]);
  });

  it('given a restarted count for the same gift, when ingested, then closes the previous streak', () => {
    const { aggregator } = setup();
    aggregator.ingest(1, aRawGift({ quantity: 5 }));
    const out = aggregator.ingest(1, aRawGift({ quantity: 1 }));
    expect(out.map((g) => g.gift.quantity)).toEqual([5]);
    expect(aggregator.openCount).toBe(1);
  });

  it('given streaks from two viewers, when they end, then they are consolidated separately', () => {
    const { aggregator } = setup();
    const a = aViewer({ tiktokUserId: 'a' });
    const b = aViewer({ tiktokUserId: 'b' });
    aggregator.ingest(1, aRawGift({ viewer: a, quantity: 2 }));
    aggregator.ingest(1, aRawGift({ viewer: b, quantity: 7 }));
    const out = aggregator.flushAll();
    expect(out.map((g) => [g.gift.viewer.tiktokUserId, g.gift.quantity])).toEqual([
      ['a', 2],
      ['b', 7],
    ]);
  });
});
