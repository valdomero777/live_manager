import type { LiveEvent } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aLikeEvent, aViewer } from '../../../test/support/builders.js';
import {
  goalStatus,
  MAX_CYCLES_PER_UPDATE,
  newlyReachedCycles,
  targetForCycle,
} from './goal-progress.js';
import { goalMetricToMetric, isoWeekKey, metricDeltas, scopeKey, scopeKeysFor } from './scopes.js';
import { StatsProjection } from './stats-projection.js';

describe('isoWeekKey', () => {
  it.each([
    ['2026-01-01T12:00:00Z', '2026-01'], // Thursday
    ['2027-01-01T12:00:00Z', '2026-53'], // Friday belongs to the previous ISO year
    ['2024-12-30T00:00:00Z', '2025-01'], // Monday of week 1 of 2025
    ['2026-10-06T23:59:59Z', '2026-41'],
  ])('%s -> %s', (iso, expected) => {
    expect(isoWeekKey(Date.parse(iso))).toBe(expected);
  });
});

describe('scopes', () => {
  it('builds session, week and total keys', () => {
    const at = Date.parse('2026-10-06T10:00:00Z');
    expect(scopeKey('session', 7, at)).toBe('session:7');
    expect(scopeKey('week', 7, at)).toBe('week:2026-41');
    expect(scopeKey('total', 7, at)).toBe('total');
    expect(scopeKeysFor(aGiftEvent({ sessionId: 3, occurredAt: at }))).toEqual([
      'session:3',
      'week:2026-41',
      'total',
    ]);
  });

  it('maps goal metrics to leaderboard metrics', () => {
    expect(goalMetricToMetric('gifts')).toBe('gift_count');
    expect(goalMetricToMetric('diamonds')).toBe('diamonds');
  });
});

describe('metricDeltas', () => {
  it('counts final gifts as diamonds x quantity and quantity', () => {
    expect(metricDeltas(aGiftEvent({ diamondValue: 5, quantity: 10 }))).toEqual([
      { metric: 'diamonds', amount: 50 },
      { metric: 'gift_count', amount: 10 },
    ]);
  });

  it('ignores partial streak events so a streak is summed once', () => {
    expect(metricDeltas(aGiftEvent({ isStreakFinal: false }))).toEqual([]);
  });

  it('uses the like delta and ignores other events', () => {
    expect(metricDeltas(aLikeEvent({ likeDelta: 7 }))).toEqual([{ metric: 'likes', amount: 7 }]);
    expect(metricDeltas(aLikeEvent({ likeDelta: 0 }))).toEqual([]);
    expect(metricDeltas(aCommentEvent())).toEqual([]);
  });
});

describe('goal progress', () => {
  const oneShot = { target: 100, repeatFactor: null };
  const doubling = { target: 100, repeatFactor: 2 };

  it('computes cycle targets with the repeat factor', () => {
    expect([1, 2, 3].map((c) => targetForCycle(doubling, c))).toEqual([100, 200, 400]);
    expect(targetForCycle(oneShot, 3)).toBe(100);
  });

  it('a one-shot goal is reached once', () => {
    expect(newlyReachedCycles(oneShot, 99, 0)).toEqual([]);
    expect(newlyReachedCycles(oneShot, 500, 0)).toEqual([1]);
    expect(newlyReachedCycles(oneShot, 900, 1)).toEqual([]);
    expect(goalStatus(oneShot, 900, 1)).toEqual({ cycle: 1, target: 100, ratio: 1, reached: true });
  });

  it('a repeating goal reaches several cycles with cumulative progress', () => {
    expect(newlyReachedCycles(doubling, 450, 0)).toEqual([1, 2, 3]);
    expect(newlyReachedCycles(doubling, 450, 3)).toEqual([]);
    expect(goalStatus(doubling, 300, 2)).toEqual({
      cycle: 3,
      target: 400,
      ratio: 0.75,
      reached: false,
    });
  });

  it('caps the cycles reached in one update', () => {
    const tiny = { target: 1, repeatFactor: 1.01 };
    expect(newlyReachedCycles(tiny, 1_000_000, 0)).toHaveLength(MAX_CYCLES_PER_UPDATE);
  });
});

describe('StatsProjection', () => {
  const at = (event: LiveEvent, sessionId = 1) => ({ ...event, sessionId });

  it('tracks viewers, peak, likes, diamonds, followers and gifts', () => {
    const stats = new StatsProjection();
    stats.apply(at({ id: 'v', sessionId: 1, occurredAt: 1, type: 'viewerCount', viewerCount: 40 }));
    stats.apply(
      at({ id: 'v2', sessionId: 1, occurredAt: 2, type: 'viewerCount', viewerCount: 25 }),
    );
    stats.apply(aLikeEvent({ totalLikes: 300 }));
    stats.apply(aGiftEvent({ diamondValue: 1, quantity: 5, giftName: 'Rose' }));
    stats.apply(
      aGiftEvent({
        diamondValue: 100,
        quantity: 1,
        giftName: 'Lion',
        viewer: aViewer({ uniqueId: 'big' }),
      }),
    );
    stats.apply(aGiftEvent({ diamondValue: 1, quantity: 1, giftName: 'GG' }));
    stats.apply({
      id: 'f',
      sessionId: 1,
      occurredAt: 3,
      type: 'follow',
      viewer: aViewer({ nickname: 'Ana' }),
    });

    expect(stats.snapshot()).toMatchObject({
      sessionId: 1,
      viewers: 25,
      peakViewers: 40,
      likes: 300,
      diamonds: 106,
      newFollowers: 1,
      lastGift: { giftName: 'GG' },
      topGift: { giftName: 'Lion', uniqueId: 'big', diamonds: 100 },
      lastFollower: { nickname: 'Ana' },
    });
  });

  it('never lets the like total go backwards', () => {
    const stats = new StatsProjection();
    stats.apply(aLikeEvent({ totalLikes: 300 }));
    stats.apply(aLikeEvent({ totalLikes: 250 }));
    expect(stats.snapshot().likes).toBe(300);
  });

  it('resets on a new session and reports unchanged events', () => {
    const stats = new StatsProjection();
    stats.apply(aGiftEvent({ diamondValue: 10 }));
    expect(stats.apply(aCommentEvent())).toBe(false);
    stats.apply(aCommentEvent({ sessionId: 2 }));
    expect(stats.snapshot()).toMatchObject({ sessionId: 2, diamonds: 0, lastGift: null });
  });
});
