import { TtsSettingsSchema, type Rule, type TtsSettings } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent, aRule, aViewer } from '../../../test/support/builders.js';
import { MemorySettings, RecordingNotifier, SequentialIds } from '../../../test/support/fakes.js';
import { createDefaultActionRegistry, type PlannedAction } from '../../domain/rules/actions.js';
import { createDefaultConditionRegistry } from '../../domain/rules/conditions.js';
import { RuleRateLimiter } from '../../domain/rules/rate-limiter.js';
import { FakeClock } from '../../domain/shared/time.js';
import { DEFAULT_MODERATION, buildModerationChain } from '../../domain/tts/text-filters.js';
import { silentLogger } from '../ports/logger.js';
import type { ServerActionConfig } from '@tiklive/contracts';
import type { ServerActionRunner } from '../actions/server-action-runner.js';
import type { LanguageScorer } from '../../domain/tts/speech-language.js';
import type { SpeechSynthesizer } from '../ports/speech-synthesizer.js';
import { TtsService } from '../tts/tts-service.js';
import { RuleEngine } from './rule-engine.js';

/** Fake detector: English when the text contains "the", Spanish otherwise. */
const fakeScorer: LanguageScorer = (text) =>
  /\bthe\b/i.test(text)
    ? [
        ['en', 1],
        ['es', 0.5],
      ]
    : [['es', 1]];

function ttsService(clock: FakeClock, topGifters: readonly string[] = []) {
  return new TtsService({
    repo: new MemorySettings(),
    synthesizer: {} as SpeechSynthesizer,
    scoreLanguages: fakeScorer,
    topGifters: async () => topGifters,
    clock,
    logger: silentLogger,
  });
}

function ttsSettings(over: Record<string, unknown>): TtsSettings {
  return TtsSettingsSchema.parse(over);
}

function setup(rules: Rule[], topGifters: readonly string[] = []) {
  const serverRuns: { action: ServerActionConfig; vars: Record<string, string> }[] = [];
  const clock = new FakeClock(0);
  const planned: PlannedAction[] = [];
  const fakeRunner = {
    run: (action: ServerActionConfig, ctx: { vars: Record<string, string> }) => {
      serverRuns.push({ action, vars: { ...ctx.vars } });
      return true;
    },
  };
  const notifier = new RecordingNotifier();
  const disabled: number[] = [];
  const moderation = buildModerationChain({ ...DEFAULT_MODERATION, blockedTerms: ['feo'] }, clock);
  const tts = ttsService(clock, topGifters);
  const engine = new RuleEngine({
    rules: { listAll: async () => rules, findById: async (id) => rules.find((r) => r.id === id) },
    conditions: createDefaultConditionRegistry(),
    actions: createDefaultActionRegistry(),
    limiter: new RuleRateLimiter(clock, { next: () => 0 }),
    sink: { enqueue: (a) => planned.push(a) },
    serverActions: fakeRunner as unknown as ServerActionRunner,
    assets: { urlFor: (id) => `/media/${id}.mp3` },
    moderation: () => moderation,
    speech: tts,
    ids: new SequentialIds(),
    random: { next: () => 0 },
    notifier,
    logger: silentLogger,
    onInvalidRule: async (rule) => {
      disabled.push(rule.id);
    },
  });
  return { engine, planned, notifier, disabled, clock, serverRuns, tts };
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

  it('given a comment that moderation drops, when the same viewer writes again inside the cooldown, then that one is read', async () => {
    const { engine, planned } = setup([
      aRule({
        id: 1,
        trigger: 'comment',
        userCooldownMs: 10_000,
        actions: [{ type: 'speak', text: '{comment}' }],
      }),
    ]);
    await engine.reload();

    engine.handle(aCommentEvent({ text: 'eres feo' }));
    engine.handle(aCommentEvent({ id: 'evt-2', text: 'hola a todos' }));
    expect(planned.map((p) => p.command.payload)).toEqual([
      expect.objectContaining({ text: 'hola a todos' }),
    ]);

    engine.handle(aCommentEvent({ id: 'evt-3', text: 'otro mensaje' }));
    expect(planned).toHaveLength(1);
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

  describe('server actions', () => {
    const goalAndHook: Rule['actions'] = [
      { type: 'updateGoal', goalId: 3, amount: 5 },
      {
        type: 'webhook',
        url: 'https://hooks.example.com/x',
        method: 'POST',
        body: '{"c":"{comment}"}',
      },
    ];

    it('given updateGoal and webhook, when the rule matches, then runs them without screens', async () => {
      const { engine, planned, serverRuns } = setup([
        aRule({ id: 1, trigger: 'comment', actions: goalAndHook }),
      ]);
      await engine.reload();

      engine.handle(aCommentEvent({ text: 'hola' }));

      expect(planned).toEqual([]);
      expect(serverRuns.map((r) => r.action.type)).toEqual(['updateGoal', 'webhook']);
      expect(serverRuns[1]?.vars['comment']).toBe('hola');
    });

    it('given a blocked comment in a webhook body, when it arrives, then the webhook does not run', async () => {
      const { engine, serverRuns } = setup([
        aRule({ id: 1, trigger: 'comment', actions: [goalAndHook[1] as ServerActionConfig] }),
      ]);
      await engine.reload();

      engine.handle(aCommentEvent({ text: 'eres feo' }));

      expect(serverRuns).toEqual([]);
    });

    it('given a rule test, when it has server actions, then they are skipped, not run', async () => {
      const rule = aRule({ id: 1, trigger: 'comment', actions: goalAndHook });
      const { engine, serverRuns } = setup([rule]);

      const result = engine.test(rule, aCommentEvent({ text: 'hola' }));

      expect(serverRuns).toEqual([]);
      expect(result).toMatchObject({ matched: true, actionsQueued: 0, actionsSkipped: 2 });
    });
  });
  describe('speech (TTS settings)', () => {
    const readComments = (text = '{nickname} dice {comment}') =>
      aRule({ id: 1, trigger: 'comment', actions: [{ type: 'speak', text }] });
    const payloads = (planned: PlannedAction[]) => planned.map((p) => p.command.payload);

    it('sends the configured voice with every speak action', async () => {
      const { engine, planned, tts } = setup([readComments()]);
      await tts.update(
        ttsSettings({ voice: { engine: 'edge', language: 'es-ES', gender: 'male', rate: 1.2 } }),
      );
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'hola' }));
      expect(payloads(planned)[0]).toMatchObject({
        engine: 'edge',
        lang: 'es-ES',
        gender: 'male',
        rate: 1.2,
        pitch: 1,
      });
      // Edge needs a round trip to synthesise: the ack timeout is longer.
      expect(planned[0]!.timeoutMs).toBeGreaterThan(7_000);
    });

    it("the action's own voice, rate and pitch win over the settings", async () => {
      const rule = aRule({
        id: 1,
        trigger: 'comment',
        actions: [
          { type: 'speak', text: '{comment}', voice: 'Microsoft Raul', rate: 2, pitch: 0.5 },
        ],
      });
      const { engine, planned } = setup([rule]);
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'hola' }));
      expect(payloads(planned)[0]).toMatchObject({ voice: 'Microsoft Raul', rate: 2, pitch: 0.5 });
    });

    it('reads only the audience: with followers only, a non-follower is silent', async () => {
      const { engine, planned, tts } = setup([readComments()]);
      await tts.update(ttsSettings({ audience: { everyone: false, followers: true } }));
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'hola' }));
      engine.handle(
        aCommentEvent({ id: 'evt-2', text: 'hola', viewer: aViewer({ isFollower: true }) }),
      );
      expect(payloads(planned)).toEqual([expect.objectContaining({ text: 'Nick u1 dice hola' })]);
      expect(planned[0]!.eventId).toBe('evt-2');
    });

    it('audience filters only apply when the voice reads viewer text', async () => {
      const rule = aRule({ id: 1, actions: [{ type: 'speak', text: 'Gracias {nickname}' }] });
      const { engine, planned, tts } = setup([rule]);
      await tts.update(ttsSettings({ audience: { everyone: false } }));
      await engine.reload();
      engine.handle(aGiftEvent());
      expect(planned).toHaveLength(1);
    });

    it('a viewer outside the audience does not use up the per-user rate limit', async () => {
      const { engine, planned, tts } = setup([readComments()]);
      await tts.update(ttsSettings({ audience: { everyone: false, moderators: true } }));
      await engine.reload();
      for (let i = 0; i < 5; i++) engine.handle(aCommentEvent({ id: `x${i}`, text: `hola ${i}` }));
      await tts.update(ttsSettings({}));
      engine.handle(aCommentEvent({ id: 'evt-9', text: 'ya me leen' }));
      expect(payloads(planned)).toEqual([
        expect.objectContaining({ text: 'Nick u1 dice ya me leen' }),
      ]);
    });

    it('top gifters come from the room ranking (refreshed in the background)', async () => {
      const { engine, planned, tts } = setup([readComments()], ['user_u1']);
      await tts.update(
        ttsSettings({ audience: { everyone: false, topGifters: { enabled: true, top: 1 } } }),
      );
      await new Promise((r) => setTimeout(r, 0));
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'soy top' }));
      engine.handle(
        aCommentEvent({ id: 'evt-2', text: 'no soy', viewer: aViewer({ tiktokUserId: 'u2' }) }),
      );
      expect(payloads(planned)).toEqual([
        expect.objectContaining({ text: 'Nick u1 dice soy top' }),
      ]);
    });

    it('skips a comment in another language and can switch the voice instead', async () => {
      const { engine, planned, tts } = setup([readComments()]);
      await tts.update(ttsSettings({ language: { detectionMinLength: 10 } }));
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'the stream is great today' }));
      expect(planned).toEqual([]);

      await tts.update(
        ttsSettings({
          voice: { voiceName: 'es-MX-DaliaNeural' },
          language: { detectionMinLength: 10, otherLanguage: 'switchVoice' },
        }),
      );
      engine.handle(aCommentEvent({ id: 'evt-2', text: 'the chat is great today' }));
      expect(payloads(planned)[0]).toMatchObject({ lang: 'en', gender: 'female' });
      // A specific voice belongs to the configured language, so it is not sent.
      expect(payloads(planned)[0]).not.toHaveProperty('voice');
    });

    it('skips a comment in another alphabet by default', async () => {
      const { engine, planned } = setup([readComments()]);
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'привет всем' }));
      expect(planned).toEqual([]);
    });

    it('formats the spoken text and cleans fancy nicknames', async () => {
      const { engine, planned } = setup([readComments()]);
      await engine.reload();
      engine.handle(
        aCommentEvent({
          text: 'JAJAJAJA QUE BUENO!!!!',
          viewer: aViewer({ nickname: '✨𝓜𝓪𝓻𝓲𝓪✨' }),
        }),
      );
      expect(payloads(planned)[0]).toMatchObject({ text: 'Maria dice jaja que bueno!' });
    });

    it('alerts keep the original nickname and are not language-filtered', async () => {
      const rule = aRule({
        id: 1,
        trigger: 'comment',
        actions: [{ type: 'showAlert', text: '{nickname}: {comment}' }],
      });
      const { engine, planned } = setup([rule]);
      await engine.reload();
      engine.handle(aCommentEvent({ text: 'привет', viewer: aViewer({ nickname: '✨Ana✨' }) }));
      expect(payloads(planned)[0]).toMatchObject({ text: '✨Ana✨: привет' });
    });
  });
});
