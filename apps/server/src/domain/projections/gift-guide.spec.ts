import type { GiftInfo } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aRule } from '../../../test/support/builders.js';
import { buildGiftGuide } from './gift-guide.js';

const rose: GiftInfo = { id: 5655, name: 'Rose', diamonds: 1, imageUrl: 'https://x/rose.png' };
const lion: GiftInfo = { id: 6, name: 'Lion', diamonds: 29999 };

const forGift = (value: number | string, extra: Parameters<typeof aRule>[0] = {}) =>
  aRule({
    conditions:
      typeof value === 'number'
        ? [{ type: 'giftId', op: 'eq', value }]
        : [{ type: 'giftName', op: 'eq', value }],
    ...extra,
  });

describe('buildGiftGuide', () => {
  it('is empty when no rule names a gift: nothing is promised', () => {
    const anyGift = aRule({ conditions: [] });
    const contains = aRule({ conditions: [{ type: 'giftName', op: 'contains', value: 'Ro' }] });
    expect(buildGiftGuide([anyGift, contains], [rose])).toEqual([]);
  });

  it('lists an exact gift with its sound, speech and alert, and drops server actions', () => {
    const rule = forGift(5655, {
      actions: [
        { type: 'playSound', assetId: 1 },
        { type: 'speak', text: 'Gracias {nickname}' },
        { type: 'showAlert', text: 'Rosa!' },
        { type: 'updateGoal', goalId: 1, amount: 5 },
        { type: 'webhook', url: 'https://example.com/hook' },
      ],
    });
    expect(buildGiftGuide([rule], [rose])).toEqual([
      {
        giftId: 5655,
        giftName: 'Rose',
        imageUrl: 'https://x/rose.png',
        diamonds: 1,
        conditional: false,
        actions: [
          { kind: 'sound' },
          { kind: 'speech', text: 'Gracias …' },
          { kind: 'alert', text: 'Rosa!' },
        ],
      },
    ]);
  });

  it('ignores disabled rules, other triggers and rules with only server actions', () => {
    const rules = [
      forGift(5655, { enabled: false }),
      forGift(5655, { trigger: 'comment' }),
      forGift(6, { actions: [{ type: 'updateGoal', goalId: 1, amount: 1 }] }),
    ];
    expect(buildGiftGuide(rules, [rose, lion])).toEqual([]);
  });

  it('merges rules of the same gift and marks conditional ones', () => {
    const plain = forGift('rose', { actions: [{ type: 'playSound', assetId: 1 }] });
    const big = forGift(5655, {
      conditions: [
        { type: 'giftId', op: 'eq', value: 5655 },
        { type: 'quantity', op: 'gte', value: 10 },
      ],
      actions: [{ type: 'showAlert', text: 'Combo' }],
    });
    const [entry, ...rest] = buildGiftGuide([big, plain], [rose]);
    expect(rest).toEqual([]);
    expect(entry?.actions).toEqual([{ kind: 'alert', text: 'Combo' }, { kind: 'sound' }]);
    expect(entry?.conditional).toBe(false);
    expect(buildGiftGuide([big], [rose])[0]?.conditional).toBe(true);
  });

  it('still lists the gift by name without a catalog, and sorts by price', () => {
    expect(buildGiftGuide([forGift('Galaxy')])[0]).toMatchObject({ giftName: 'Galaxy' });
    const names = buildGiftGuide([forGift(6), forGift(5655), forGift('Mystery')], [rose, lion]).map(
      (e) => e.giftName,
    );
    expect(names).toEqual(['Rose', 'Lion', 'Mystery']);
  });
});
