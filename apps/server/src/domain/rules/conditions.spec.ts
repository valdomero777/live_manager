import type { ConditionConfig, LiveEvent } from '@tiklive/contracts';
import { ConditionConfigSchema } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aLikeEvent, aViewer } from '../../../test/support/builders.js';
import { UnknownConditionError, UnsafePatternError } from '../shared/errors.js';
import type { EvaluationContext } from './condition.js';
import { ConditionRegistry } from './condition.js';
import { compareNumber, createDefaultConditionRegistry } from './conditions.js';

const registry = createDefaultConditionRegistry();
const noCtx: EvaluationContext = { likesBefore: 0, likesAfter: 0, isFirstInteraction: false };

function holds(config: unknown, event: LiveEvent, ctx: EvaluationContext = noCtx): boolean {
  return registry.create(ConditionConfigSchema.parse(config)).isSatisfiedBy(event, ctx);
}

describe('giftName', () => {
  it('matches case-insensitively with eq, neq and contains', () => {
    const rose = aGiftEvent({ giftName: 'Rose' });
    expect(holds({ type: 'giftName', op: 'eq', value: 'rose' }, rose)).toBe(true);
    expect(holds({ type: 'giftName', op: 'neq', value: 'rose' }, rose)).toBe(false);
    expect(holds({ type: 'giftName', op: 'contains', value: 'os' }, rose)).toBe(true);
  });

  it('never matches non-gift events', () => {
    expect(holds({ type: 'giftName', op: 'neq', value: 'x' }, aCommentEvent())).toBe(false);
  });
});

describe('giftId', () => {
  it('compares the numeric id', () => {
    expect(holds({ type: 'giftId', op: 'eq', value: 5655 }, aGiftEvent())).toBe(true);
    expect(holds({ type: 'giftId', op: 'neq', value: 5655 }, aGiftEvent())).toBe(false);
  });
});

describe('diamondsTotal', () => {
  it('uses diamondValue x quantity', () => {
    const gift = aGiftEvent({ diamondValue: 5, quantity: 10 });
    expect(holds({ type: 'diamondsTotal', op: 'gte', value: 50 }, gift)).toBe(true);
    expect(holds({ type: 'diamondsTotal', op: 'gt', value: 50 }, gift)).toBe(false);
  });
});

describe('quantity', () => {
  it('compares the consolidated quantity', () => {
    expect(holds({ type: 'quantity', op: 'gte', value: 10 }, aGiftEvent({ quantity: 10 }))).toBe(
      true,
    );
    expect(holds({ type: 'quantity', op: 'lt', value: 10 }, aGiftEvent({ quantity: 10 }))).toBe(
      false,
    );
  });
});

describe('compareNumber', () => {
  it.each([
    ['eq', 5, 5, true],
    ['lte', 5, 4, false],
    ['lt', 4, 5, true],
    ['gte', 4, 5, false],
  ] as const)('%s(%d, %d) is %s', (op, a, b, expected) => {
    expect(compareNumber(op, a, b)).toBe(expected);
  });
});

describe('likesCumulative', () => {
  const like = aLikeEvent();

  it('every: fires each time a multiple is crossed', () => {
    const cfg = { type: 'likesCumulative', mode: 'every', value: 100 };
    expect(holds(cfg, like, { ...noCtx, likesBefore: 90, likesAfter: 110 })).toBe(true);
    expect(holds(cfg, like, { ...noCtx, likesBefore: 110, likesAfter: 150 })).toBe(false);
    expect(holds(cfg, like, { ...noCtx, likesBefore: 150, likesAfter: 200 })).toBe(true);
  });

  it('threshold: fires only once when crossing the value', () => {
    const cfg = { type: 'likesCumulative', mode: 'threshold', value: 100 };
    expect(holds(cfg, like, { ...noCtx, likesBefore: 90, likesAfter: 100 })).toBe(true);
    expect(holds(cfg, like, { ...noCtx, likesBefore: 100, likesAfter: 300 })).toBe(false);
  });

  it('ignores non-like events', () => {
    const cfg = { type: 'likesCumulative', mode: 'every', value: 1 };
    expect(holds(cfg, aGiftEvent(), { ...noCtx, likesAfter: 5 })).toBe(false);
  });
});

describe('userRole', () => {
  it('checks follower, subscriber and moderator flags', () => {
    const event = aCommentEvent({ viewer: aViewer({ isFollower: true, isModerator: true }) });
    expect(holds({ type: 'userRole', role: 'follower' }, event)).toBe(true);
    expect(holds({ type: 'userRole', role: 'subscriber' }, event)).toBe(false);
    expect(holds({ type: 'userRole', role: 'moderator' }, event)).toBe(true);
  });

  it('is false for events without a viewer', () => {
    const count: LiveEvent = {
      id: 'x',
      sessionId: 1,
      occurredAt: 0,
      type: 'viewerCount',
      viewerCount: 3,
    };
    expect(holds({ type: 'userRole', role: 'follower' }, count)).toBe(false);
  });
});

describe('keyword', () => {
  const comment = (text: string) => aCommentEvent({ text });

  it('supports contains, startsWith and equals, case-insensitive by default', () => {
    expect(holds({ type: 'keyword', match: 'contains', value: 'HOLA' }, comment('ey hola!'))).toBe(
      true,
    );
    expect(
      holds({ type: 'keyword', match: 'startsWith', value: '!di' }, comment('  !di algo')),
    ).toBe(true);
    expect(holds({ type: 'keyword', match: 'equals', value: '!dance' }, comment('!Dance '))).toBe(
      true,
    );
    expect(
      holds({ type: 'keyword', match: 'equals', value: '!dance' }, comment('!dance now')),
    ).toBe(false);
  });

  it('respects caseSensitive', () => {
    const cfg = { type: 'keyword', match: 'contains', value: 'Hola', caseSensitive: true };
    expect(holds(cfg, comment('hola'))).toBe(false);
  });

  it('supports safe regex and rejects catastrophic patterns', () => {
    expect(
      holds({ type: 'keyword', match: 'regex', value: '^!(dance|baile)$' }, comment('!baile')),
    ).toBe(true);
    expect(() =>
      holds({ type: 'keyword', match: 'regex', value: '(a+)+$' }, comment('aaa')),
    ).toThrow(UnsafePatternError);
  });

  it('only applies to comments', () => {
    expect(holds({ type: 'keyword', match: 'contains', value: 'rose' }, aGiftEvent())).toBe(false);
  });
});

describe('firstTime', () => {
  it('reads the first-interaction flag from the context', () => {
    expect(
      holds({ type: 'firstTime' }, aCommentEvent(), { ...noCtx, isFirstInteraction: true }),
    ).toBe(true);
    expect(holds({ type: 'firstTime' }, aCommentEvent())).toBe(false);
  });
});

describe('ConditionRegistry', () => {
  it('throws UnknownConditionError for unregistered types', () => {
    const empty = new ConditionRegistry();
    const cfg: ConditionConfig = { type: 'firstTime' };
    expect(() => empty.create(cfg)).toThrow(UnknownConditionError);
  });
});
