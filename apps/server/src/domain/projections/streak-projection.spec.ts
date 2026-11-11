import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aViewer } from '../../../test/support/builders.js';
import { StreakProjection } from './streak-projection.js';

describe('StreakProjection', () => {
  it('has no leader until a streak is completed: nothing is inferred', () => {
    const streak = new StreakProjection();
    expect(streak.leader()).toBeNull();
    expect(streak.apply(aGiftEvent({ quantity: 1 }))).toBe(false);
    expect(streak.apply(aCommentEvent())).toBe(false);
    expect(streak.leader()).toBeNull();
  });

  it('keeps the longest streak and the earlier one on a tie', () => {
    const streak = new StreakProjection();
    expect(
      streak.apply(aGiftEvent({ id: 'a', quantity: 5, viewer: aViewer({ nickname: 'Ana' }) })),
    ).toBe(true);
    expect(
      streak.apply(aGiftEvent({ id: 'b', quantity: 5, viewer: aViewer({ nickname: 'Beto' }) })),
    ).toBe(false);
    expect(streak.apply(aGiftEvent({ id: 'c', quantity: 3 }))).toBe(false);
    expect(streak.leader()).toMatchObject({ nickname: 'Ana', count: 5, giftName: 'Rose' });
    expect(
      streak.apply(aGiftEvent({ id: 'd', quantity: 9, viewer: aViewer({ nickname: 'Beto' }) })),
    ).toBe(true);
    expect(streak.leader()).toMatchObject({ nickname: 'Beto', count: 9 });
  });

  it('ignores a gift that is not final', () => {
    const streak = new StreakProjection();
    expect(streak.apply(aGiftEvent({ quantity: 7, isStreakFinal: false }))).toBe(false);
    expect(streak.leader()).toBeNull();
  });

  it('clears the leader when a new session starts', () => {
    const streak = new StreakProjection();
    streak.apply(aGiftEvent({ quantity: 4, sessionId: 1 }));
    expect(streak.apply(aCommentEvent({ sessionId: 2 }))).toBe(true);
    expect(streak.leader()).toBeNull();
  });
});
