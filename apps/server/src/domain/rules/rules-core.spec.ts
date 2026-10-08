import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aLikeEvent, aRule } from '../../../test/support/builders.js';
import { ViewerActivityTracker } from '../session/viewer-activity.js';
import { UnknownActionError } from '../shared/errors.js';
import { FakeClock, SeededRandom, type Random } from '../shared/time.js';
import {
  ACK_GRACE_MS,
  ActionHandlerRegistry,
  createDefaultActionRegistry,
  type PlanContext,
} from './actions.js';
import { CompiledRule, byPriority } from './compiled-rule.js';
import { createDefaultConditionRegistry } from './conditions.js';
import { RuleRateLimiter } from './rate-limiter.js';
import { resolveTemplate, templateVariables } from './template.js';

const fixed = (value: number): Random => ({ next: () => value });

describe('RuleRateLimiter', () => {
  const policy = { ruleId: 1, cooldownMs: 30_000, userCooldownMs: 0, probability: 1 };

  it('given a 30s cooldown, when fired twice within 30s, then the second is limited (RF-07)', () => {
    const clock = new FakeClock(0);
    const limiter = new RuleRateLimiter(clock, fixed(0));
    expect(limiter.tryAcquire(policy, 'u1')).toBe('allowed');
    clock.advance(29_999);
    expect(limiter.tryAcquire(policy, 'u2')).toBe('global_cooldown');
    clock.advance(1);
    expect(limiter.tryAcquire(policy, 'u2')).toBe('allowed');
  });

  it('applies the per-user cooldown independently per viewer', () => {
    const limiter = new RuleRateLimiter(new FakeClock(0), fixed(0));
    const perUser = { ...policy, cooldownMs: 0, userCooldownMs: 10_000 };
    expect(limiter.tryAcquire(perUser, 'a')).toBe('allowed');
    expect(limiter.tryAcquire(perUser, 'a')).toBe('user_cooldown');
    expect(limiter.tryAcquire(perUser, 'b')).toBe('allowed');
  });

  it('uses the injected random for probability', () => {
    const limiter = new RuleRateLimiter(new FakeClock(0), fixed(0.7));
    expect(limiter.tryAcquire({ ...policy, cooldownMs: 0, probability: 0.5 }, 'a')).toBe(
      'probability',
    );
    expect(limiter.tryAcquire({ ...policy, cooldownMs: 0, probability: 0.8 }, 'a')).toBe('allowed');
  });

  it('property: never allows two executions inside the cooldown window', () => {
    const random = new SeededRandom(1234);
    for (let run = 0; run < 50; run++) {
      const clock = new FakeClock(0);
      const limiter = new RuleRateLimiter(clock, random);
      const cooldownMs = 1 + Math.floor(random.next() * 10_000);
      const allowedAt: number[] = [];
      for (let i = 0; i < 200; i++) {
        clock.advance(Math.floor(random.next() * 2_000));
        const viewer = `v${Math.floor(random.next() * 5)}`;
        if (limiter.tryAcquire({ ...policy, cooldownMs }, viewer) === 'allowed')
          allowedAt.push(clock.now());
      }
      for (let i = 1; i < allowedAt.length; i++) {
        expect(allowedAt[i]! - allowedAt[i - 1]!).toBeGreaterThanOrEqual(cooldownMs);
      }
    }
  });

  it('forget() clears global and per-user state for a rule', () => {
    const limiter = new RuleRateLimiter(new FakeClock(0), fixed(0));
    const both = { ...policy, userCooldownMs: 30_000 };
    limiter.tryAcquire(both, 'a');
    limiter.forget(1);
    expect(limiter.tryAcquire(both, 'a')).toBe('allowed');
  });
});

describe('templates', () => {
  it('resolves gift variables', () => {
    const vars = templateVariables(aGiftEvent({ quantity: 3, diamondValue: 5 }));
    expect(resolveTemplate('{nickname} envió {quantity} {giftName} ({diamonds})', vars)).toBe(
      'Nick u1 envió 3 Rose (15)',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(resolveTemplate('hola {nope}', templateVariables(aCommentEvent()))).toBe('hola {nope}');
  });

  it('exposes like and comment variables', () => {
    expect(templateVariables(aLikeEvent({ likeDelta: 4, totalLikes: 40 }))).toMatchObject({
      likes: '4',
      totalLikes: '40',
    });
    expect(templateVariables(aCommentEvent({ text: 'yo' }))).toMatchObject({ comment: 'yo' });
  });

  it('falls back to uniqueId when the nickname is empty', () => {
    const event = aCommentEvent();
    const vars = templateVariables({ ...event, viewer: { ...event.viewer, nickname: '' } });
    expect(vars['nickname']).toBe('user_u1');
  });
});

describe('CompiledRule', () => {
  const conditions = createDefaultConditionRegistry();

  it('matches its trigger only while enabled', () => {
    expect(CompiledRule.compile(aRule(), conditions).matchesTrigger(aGiftEvent())).toBe(true);
    expect(
      CompiledRule.compile(aRule({ enabled: false }), conditions).matchesTrigger(aGiftEvent()),
    ).toBe(false);
    expect(CompiledRule.compile(aRule(), conditions).matchesTrigger(aCommentEvent())).toBe(false);
  });

  it('ANDs all conditions', () => {
    const rule = CompiledRule.compile(
      aRule({
        conditions: [
          { type: 'giftName', op: 'eq', value: 'Rose' },
          { type: 'quantity', op: 'gte', value: 10 },
        ],
      }),
      conditions,
    );
    const ctx = new ViewerActivityTracker().record(aGiftEvent());
    expect(rule.conditionsHold(aGiftEvent({ quantity: 10 }), ctx)).toBe(true);
    expect(rule.conditionsHold(aGiftEvent({ quantity: 9 }), ctx)).toBe(false);
  });

  it('selects all actions in mode all and exactly one in mode random (RF-09)', () => {
    const actions = [
      { type: 'showAlert' as const, text: 'a' },
      { type: 'showAlert' as const, text: 'b' },
      { type: 'showAlert' as const, text: 'c' },
    ];
    const all = CompiledRule.compile(aRule({ actions }), conditions);
    const random = CompiledRule.compile(aRule({ actions, mode: 'random' }), conditions);
    expect(all.selectActions(fixed(0))).toHaveLength(3);
    expect(random.selectActions(fixed(0.99))).toEqual([expect.objectContaining({ text: 'c' })]);
    expect(random.selectActions(fixed(0))).toEqual([expect.objectContaining({ text: 'a' })]);
  });

  it('sorts by priority descending, then id', () => {
    const a = CompiledRule.compile(aRule({ id: 1, priority: 10 }), conditions);
    const b = CompiledRule.compile(aRule({ id: 2, priority: 50 }), conditions);
    const c = CompiledRule.compile(aRule({ id: 3, priority: 10 }), conditions);
    expect([a, b, c].sort(byPriority).map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

describe('action handlers', () => {
  const registry = createDefaultActionRegistry();
  const ctx: PlanContext = {
    actionId: 'act-1',
    origin: { kind: 'rule', id: 7 },
    eventId: 'evt-1',
    priority: 50,
    vars: templateVariables(aGiftEvent({ quantity: 2 })),
    assets: { urlFor: (id) => (id === 12 ? '/media/rose.mp3' : undefined) },
  };

  it('plans playSound with the asset url and a timeout', () => {
    const planned = registry.plan(
      { type: 'playSound', screen: 'audio', assetId: 12, volume: 0.8 },
      ctx,
    );
    expect(planned).toMatchObject({
      screen: 'audio',
      priority: 50,
      command: { type: 'action.play_sound', payload: { url: '/media/rose.mp3', volume: 0.8 } },
    });
  });

  it('returns null for a missing asset', () => {
    expect(
      registry.plan({ type: 'playSound', screen: 'audio', assetId: 99, volume: 1 }, ctx),
    ).toBeNull();
  });

  it('plans showAlert with resolved text and timeout = duration + grace', () => {
    const planned = registry.plan(
      { type: 'showAlert', screen: 'alerts', text: '{nickname} x{quantity}', durationMs: 5000 },
      ctx,
    );
    expect(planned?.timeoutMs).toBe(5000 + ACK_GRACE_MS);
    expect(planned?.command.payload).toMatchObject({ text: 'Nick u1 x2' });
  });

  it('plans speak and skips empty text', () => {
    const speak = {
      type: 'speak' as const,
      screen: 'audio',
      text: 'Gracias {nickname}',
      volume: 1,
    };
    expect(registry.plan(speak, ctx)?.command).toMatchObject({
      type: 'action.speak',
      payload: { text: 'Gracias Nick u1' },
    });
    expect(registry.plan({ ...speak, text: '   ' }, ctx)).toBeNull();
  });

  it('throws UnknownActionError for unregistered types', () => {
    expect(() =>
      new ActionHandlerRegistry().plan({ type: 'speak', screen: 'a', text: 'x', volume: 1 }, ctx),
    ).toThrow(UnknownActionError);
  });
});

describe('ViewerActivityTracker', () => {
  it('accumulates likes per viewer and flags the first interaction', () => {
    const tracker = new ViewerActivityTracker();
    expect(tracker.record(aLikeEvent({ likeDelta: 10 }))).toEqual({
      likesBefore: 0,
      likesAfter: 10,
      isFirstInteraction: false,
    });
    expect(tracker.record(aCommentEvent()).isFirstInteraction).toBe(true);
    expect(tracker.record(aGiftEvent()).isFirstInteraction).toBe(false);
    expect(tracker.record(aLikeEvent({ likeDelta: 5 })).likesAfter).toBe(15);
  });

  it('resets when the session changes', () => {
    const tracker = new ViewerActivityTracker();
    tracker.record(aLikeEvent({ likeDelta: 10 }));
    expect(tracker.record(aLikeEvent({ sessionId: 2, likeDelta: 1 })).likesBefore).toBe(0);
  });
});
