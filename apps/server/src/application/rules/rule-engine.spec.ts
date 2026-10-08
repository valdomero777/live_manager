import type { Rule } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aRule } from '../../../test/support/builders.js';
import { RecordingNotifier, SequentialIds } from '../../../test/support/fakes.js';
import { createDefaultActionRegistry, type PlannedAction } from '../../domain/rules/actions.js';
import { createDefaultConditionRegistry } from '../../domain/rules/conditions.js';
import { RuleRateLimiter } from '../../domain/rules/rate-limiter.js';
import { FakeClock } from '../../domain/shared/time.js';
import { DEFAULT_MODERATION, buildModerationChain } from '../../domain/tts/text-filters.js';
import { silentLogger } from '../ports/logger.js';
import { RuleEngine } from './rule-engine.js';

function setup(rules: Rule[]) {
  const clock = new FakeClock(0);
  const planned: PlannedAction[] = [];
  const notifier = new RecordingNotifier();
  const disabled: number[] = [];
  const moderation = buildModerationChain({ ...DEFAULT_MODERATION, blockedTerms: ['feo'] }, clock);
  const engine = new RuleEngine({
    rules: { listAll: async () => rules, findById: async (id) => rules.find((r) => r.id === id) },
    conditions: createDefaultConditionRegistry(),
    actions: createDefaultActionRegistry(),
    limiter: new RuleRateLimiter(clock, { next: () => 0 }),
    sink: { enqueue: (a) => planned.push(a) },
    assets: { urlFor: (id) => `/media/${id}.mp3` },
    moderation: () => moderation,
    ids: new SequentialIds(),
    random: { next: () => 0 },
    notifier,
    logger: silentLogger,
    onInvalidRule: async (rule) => {
      disabled.push(rule.id);
    },
  });
  return { engine, planned, notifier, disabled, clock };
}

describe('RuleEngine', () => {
  it('given the spec example rule, when 10 roses arrive, then plans its three actions', async () => {
    const rule = aRule({
      id: 1,
      priority: 50,
      cooldownMs: 5000,
      conditions: [
        { type: 'giftName', op: 'eq', value: 'Rose' },
        { type: 'quantity', op: 'gte', value: 10 },
      ],
      actions: [
        { type: 'playSound', screen: 'audio', assetId: 12, volume: 0.8 },
        {
          type: 'showAlert',
          screen: 'alerts',
          text: '{nickname} envió {quantity} {giftName}',
          durationMs: 5000,
        },
        { type: 'speak', screen: 'audio', text: 'Gracias {nickname}', voice: 'es-MX' },
      ],
    });
    const { engine, planned, notifier } = setup([rule]);
    await engine.reload();

    engine.handle(aGiftEvent({ quantity: 10 }));

    expect(planned.map((p) => [p.screen, p.command.type, p.priority])).toEqual([
      ['audio', 'action.play_sound', 50],
      ['alerts', 'action.show_alert', 50],
      ['audio', 'action.speak', 50],
    ]);
    expect(planned[1]?.command.payload).toMatchObject({ text: 'Nick u1 envió 10 Rose' });
    expect(notifier.ofType('rule.executed')).toEqual([
      { ruleId: 1, eventId: 'evt-1', result: 'executed' },
    ]);
  });

  it('given a rule in cooldown, when it matches again, then reports limited', async () => {
    const { engine, planned, notifier } = setup([aRule({ id: 1, cooldownMs: 30_000 })]);
    await engine.reload();
    engine.handle(aGiftEvent());
    engine.handle(aGiftEvent());
    expect(planned).toHaveLength(1);
    expect(notifier.ofType('rule.executed').map((r) => r.result)).toEqual(['executed', 'limited']);
  });

  it('evaluates rules by priority and ignores other triggers', async () => {
    const { engine, planned } = setup([
      aRule({ id: 1, priority: 1, actions: [{ type: 'showAlert', text: 'low' }] }),
      aRule({ id: 2, priority: 9, actions: [{ type: 'showAlert', text: 'high' }] }),
      aRule({ id: 3, trigger: 'follow' }),
    ]);
    await engine.reload();
    engine.handle(aGiftEvent());
    expect(planned.map((p) => p.origin.id)).toEqual([2, 1]);
  });

  it('given a blocked comment, when a speak action reads {comment}, then nothing reaches the audio queue (RF-11)', async () => {
    const { engine, planned } = setup([
      aRule({
        id: 1,
        trigger: 'comment',
        actions: [{ type: 'speak', text: '{nickname} dice {comment}' }],
      }),
    ]);
    await engine.reload();
    engine.handle(aCommentEvent({ text: 'eres feo' }));
    expect(planned).toEqual([]);

    engine.handle(aCommentEvent({ id: 'evt-2', text: 'holaaaaa 🔥' }));
    expect(planned[0]?.command.payload).toMatchObject({ text: 'Nick u1 dice holaa' });
  });

  it('reads only what follows the command with {commandArgs}', async () => {
    const { engine, planned } = setup([
      aRule({
        id: 1,
        trigger: 'comment',
        actions: [{ type: 'speak', text: '{nickname}: {commandArgs}' }],
      }),
    ]);
    await engine.reload();
    engine.handle(aCommentEvent({ text: '!di hola a todos' }));
    engine.handle(aCommentEvent({ id: 'evt-2', text: '!di' }));
    expect(planned.map((p) => p.command.payload)).toEqual([
      expect.objectContaining({ text: 'Nick u1: hola a todos' }),
    ]);
  });

  it('given an action that cannot be planned, then reports failed without blocking the others', async () => {
    const { engine, planned, notifier } = setup([
      aRule({
        id: 1,
        actions: [
          { type: 'speak', text: '   ' },
          { type: 'showAlert', text: 'ok' },
        ],
      }),
    ]);
    await engine.reload();
    engine.handle(aGiftEvent());
    expect(planned).toHaveLength(1);
    expect(notifier.ofType('rule.executed')[0]?.result).toBe('failed');
  });

  it('given a rule that fails to compile, when reloading, then disables it and notifies', async () => {
    const bad = aRule({
      id: 5,
      trigger: 'comment',
      conditions: [{ type: 'keyword', match: 'regex', value: '(a+)+' }],
    });
    const { engine, disabled, notifier } = setup([bad]);
    await engine.reload();
    expect(disabled).toEqual([5]);
    expect(notifier.ofType('error.reported')).toHaveLength(1);
  });

  it('picks the latest rule set after reload (hot reload, RF-05)', async () => {
    const rules: Rule[] = [];
    const { engine, planned } = setup(rules);
    await engine.reload();
    engine.handle(aGiftEvent());
    expect(planned).toHaveLength(0);

    rules.push(aRule({ id: 1 }));
    await engine.reload();
    engine.handle(aGiftEvent());
    expect(planned).toHaveLength(1);
  });
});
