import {
  hasViewer,
  type ActionConfig,
  type LiveEvent,
  type Rule,
  type RuleTestResult,
  type ScreenActionConfig,
  type ServerActionConfig,
} from '@tiklive/contracts';
import type { ActionHandlerRegistry, SpeechVoice } from '../../domain/rules/actions.js';
import { type AssetCatalog } from '../../domain/rules/actions.js';
import { CompiledRule, byPriority } from '../../domain/rules/compiled-rule.js';
import type { ConditionRegistry, EvaluationContext } from '../../domain/rules/condition.js';
import type { RuleRateLimiter } from '../../domain/rules/rate-limiter.js';
import {
  stripCommand,
  templateVariables,
  type TemplateVariables,
} from '../../domain/rules/template.js';
import { ViewerActivityTracker } from '../../domain/session/viewer-activity.js';
import type { Random } from '../../domain/shared/time.js';
import type { TextFilterChain } from '../../domain/tts/text-filters.js';
import type { ActionSink } from '../actions/action-scheduler.js';
import type { ServerActionRunner } from '../actions/server-action-runner.js';
import type { LiveEventConsumer } from '../ingest/ingest-live-event.js';
import type { AdminNotifier } from '../ports/admin-notifier.js';
import type { Logger } from '../ports/logger.js';
import type { RuleReader } from '../ports/rule-repository.js';
import type { IdGenerator } from '../ports/scheduler.js';
import type { SpeechPolicy } from '../tts/tts-service.js';

/** Placeholders that expose viewer-written text; they always go through moderation. */
const VIEWER_TEXT_KEYS = ['comment', 'commandArgs'] as const;
const VIEWER_TEXT_PLACEHOLDERS = VIEWER_TEXT_KEYS.map((key) => `{${key}}`);

export interface RuleEngineDeps {
  readonly rules: RuleReader;
  readonly conditions: ConditionRegistry;
  readonly actions: ActionHandlerRegistry;
  readonly limiter: RuleRateLimiter;
  readonly sink: ActionSink;
  readonly serverActions: ServerActionRunner;
  readonly assets: AssetCatalog;
  readonly moderation: () => TextFilterChain;
  /** Voice, audience and language rules for speak actions (TTS settings). */
  readonly speech: SpeechPolicy;
  readonly ids: IdGenerator;
  readonly random: Random;
  readonly notifier: AdminNotifier;
  readonly logger: Logger;
  readonly onInvalidRule: (rule: Rule, error: Error) => Promise<void>;
}

/** Lazily moderates the comment text once per event, only if some action reads it. */
class CommentVariables {
  private moderated: string | null | undefined;

  constructor(
    private readonly event: LiveEvent,
    private readonly base: TemplateVariables,
    private readonly moderation: () => TextFilterChain,
  ) {}

  for(action: ActionConfig): TemplateVariables | null {
    if (!usesViewerText(action) || this.event.type !== 'comment') return this.base;
    if (this.moderated === undefined) {
      const ctx = { viewerId: this.event.viewer.tiktokUserId };
      this.moderated = this.moderation().apply(this.event.text, ctx);
    }
    if (this.moderated === null) return null;
    const commandArgs = stripCommand(this.moderated);
    if (viewerTemplate(action).includes('{commandArgs}') && commandArgs.length === 0) return null;
    return { ...this.base, comment: this.moderated, commandArgs };
  }
}

/** The template of an action that can carry viewer text: screen text or webhook body. */
function viewerTemplate(action: ActionConfig): string {
  if (action.type === 'webhook') return action.body;
  return 'text' in action ? action.text : '';
}

function usesViewerText(action: ActionConfig): boolean {
  const template = viewerTemplate(action);
  return VIEWER_TEXT_PLACEHOLDERS.some((p) => template.includes(p));
}

type SpeakConfig = Extract<ScreenActionConfig, { type: 'speak' }>;

interface PreparedAction {
  readonly vars: TemplateVariables;
  readonly speech?: SpeechVoice;
}

/** A specific voice belongs to the configured language; another language picks its own. */
function speechIn(voice: SpeechVoice, lang: string): SpeechVoice {
  const { voiceName, ...rest } = voice;
  return voiceName !== undefined && lang === voice.lang
    ? { ...rest, lang, voiceName }
    : { ...rest, lang };
}

const SERVER_ACTION_TYPES: readonly string[] = ['updateGoal', 'webhook'];

function isServerAction(action: ActionConfig): action is ServerActionConfig {
  return SERVER_ACTION_TYPES.includes(action.type);
}

/**
 * Matcher -> conditions -> limiter -> planner -> templates -> per-screen queue (spec 9).
 * Rules are swapped atomically on reload; in-flight evaluation keeps the previous array.
 */
export class RuleEngine implements LiveEventConsumer {
  private compiled: readonly CompiledRule[] = [];
  private readonly activity = new ViewerActivityTracker();

  constructor(private readonly deps: RuleEngineDeps) {}

  async reload(): Promise<void> {
    const rules = await this.deps.rules.listAll();
    const compiled: CompiledRule[] = [];
    for (const rule of rules) {
      const result = this.tryCompile(rule);
      if (result) compiled.push(result);
      else if (rule.enabled) await this.disableInvalid(rule);
    }
    this.compiled = compiled.sort(byPriority);
    this.deps.logger.info({ rules: this.compiled.length }, 'rules loaded');
  }

  /** Clears limiter state for an edited rule so its new cooldown starts fresh. */
  forgetLimits(ruleId: number): void {
    this.deps.limiter.forget(ruleId);
  }

  /**
   * Dashboard "Probar": evaluates one rule against a sample event and, if it matches, queues its
   * actions. Cooldown and probability are skipped so the test always shows the effect.
   */
  test(rule: Rule, event: LiveEvent): RuleTestResult {
    const compiled = CompiledRule.compile(rule, this.deps.conditions);
    const likes = event.type === 'like' ? event.likeDelta : 0;
    const ctx: EvaluationContext = { likesBefore: 0, likesAfter: likes, isFirstInteraction: true };
    const conditions = compiled.explain(event, ctx);
    const matched = rule.trigger === event.type && conditions.every((c) => c.ok);
    if (!matched) return { matched, conditions, actionsQueued: 0, actionsSkipped: 0 };
    const vars = new CommentVariables(event, templateVariables(event), this.deps.moderation);
    const outcomes = compiled
      .selectActions(this.deps.random)
      .map((action) => this.planAction(compiled, event, action, vars, true));
    const actionsQueued = outcomes.filter(Boolean).length;
    return { matched, conditions, actionsQueued, actionsSkipped: outcomes.length - actionsQueued };
  }

  handle(event: LiveEvent): void {
    const ctx = this.activity.record(event);
    const vars = new CommentVariables(event, templateVariables(event), this.deps.moderation);
    for (const rule of this.compiled) {
      if (rule.matchesTrigger(event)) this.evaluate(rule, event, ctx, vars);
    }
  }

  private evaluate(
    rule: CompiledRule,
    event: LiveEvent,
    ctx: EvaluationContext,
    vars: CommentVariables,
  ): void {
    if (!rule.conditionsHold(event, ctx)) return;
    const viewerId = 'viewer' in event ? event.viewer.tiktokUserId : undefined;
    const decision = this.deps.limiter.tryAcquire({ ...rule.rule, ruleId: rule.id }, viewerId);
    if (decision !== 'allowed') {
      this.report(rule.id, event.id, 'limited');
      return;
    }
    const failures = rule
      .selectActions(this.deps.random)
      .filter((action) => !this.planAction(rule, event, action, vars)).length;
    this.report(rule.id, event.id, failures > 0 ? 'failed' : 'executed');
  }

  /** Each action is isolated: a failure is logged and never blocks the others. */
  private planAction(
    rule: CompiledRule,
    event: LiveEvent,
    action: ActionConfig,
    vars: CommentVariables,
    dryRun = false,
  ): boolean {
    try {
      const prepared = this.prepare(event, action, vars);
      // Moderated out, or not for the voice (audience, language): intentionally silent.
      if (prepared === null) return true;
      if (isServerAction(action))
        return this.runServerAction(rule, event, action, prepared.vars, dryRun);
      const planned = this.deps.actions.plan(action, {
        actionId: this.deps.ids.next(),
        origin: { kind: 'rule', id: rule.id },
        eventId: event.id,
        priority: rule.rule.priority,
        vars: prepared.vars,
        assets: this.deps.assets,
        ...(prepared.speech ? { speech: prepared.speech } : {}),
      });
      if (!planned) {
        this.deps.logger.warn(
          { ruleId: rule.id, action: action.type },
          'action could not be planned',
        );
        return false;
      }
      this.deps.sink.enqueue(planned);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(
        { ruleId: rule.id, eventId: event.id, err: message },
        'rule.action_failed',
      );
      return false;
    }
  }

  private prepare(
    event: LiveEvent,
    action: ActionConfig,
    vars: CommentVariables,
  ): PreparedAction | null {
    if (action.type === 'speak') return this.prepareSpeech(event, action, vars);
    const actionVars = vars.for(action);
    return actionVars === null ? null : { vars: actionVars };
  }

  /**
   * The audience is checked before moderation, so viewers the voice ignores do not use up the
   * per-user rate limit. Viewer text is then formatted and checked for language and alphabet.
   */
  private prepareSpeech(
    event: LiveEvent,
    action: SpeakConfig,
    vars: CommentVariables,
  ): PreparedAction | null {
    const viewer = hasViewer(event) ? event.viewer : undefined;
    const readsViewerText = viewer !== undefined && usesViewerText(action);
    if (readsViewerText && !this.deps.speech.allowsViewer(viewer)) return null;
    const moderated = vars.for(action);
    if (moderated === null) return null;
    const voice = this.deps.speech.voice();
    const spoken = readsViewerText
      ? this.spokenViewerText(action, moderated, voice.lang)
      : { vars: moderated, lang: voice.lang };
    if (spoken === null) return null;
    const withNickname = viewer ? this.spokenNickname(spoken.vars, viewer.uniqueId) : spoken.vars;
    return { vars: withNickname, speech: speechIn(voice, spoken.lang) };
  }

  /** {comment}/{commandArgs} as the voice should read them, and the language to read them in. */
  private spokenViewerText(
    action: SpeakConfig,
    vars: TemplateVariables,
    lang: string,
  ): { vars: TemplateVariables; lang: string } | null {
    const out: Record<string, string> = { ...vars };
    let readIn = lang;
    for (const key of VIEWER_TEXT_KEYS) {
      const text = vars[key];
      if (text === undefined || !action.text.includes(`{${key}}`)) continue;
      const prepared = this.deps.speech.prepareText(text);
      if (prepared === null) return null;
      out[key] = prepared.text;
      readIn = prepared.lang;
    }
    return { vars: out, lang: readIn };
  }

  private spokenNickname(vars: TemplateVariables, uniqueId: string): TemplateVariables {
    const nickname = vars['nickname'];
    if (nickname === undefined) return vars;
    return { ...vars, nickname: this.deps.speech.speakableNickname(nickname, uniqueId) };
  }

  private runServerAction(
    rule: CompiledRule,
    event: LiveEvent,
    action: ServerActionConfig,
    vars: TemplateVariables,
    dryRun: boolean,
  ): boolean {
    // A test must not call external URLs or move goal progress.
    if (dryRun) return false;
    return this.deps.serverActions.run(action, { vars, eventId: event.id, ruleId: rule.id });
  }

  private tryCompile(rule: Rule): CompiledRule | undefined {
    try {
      return CompiledRule.compile(rule, this.deps.conditions);
    } catch (error) {
      this.deps.logger.error({ ruleId: rule.id, err: String(error) }, 'rule failed to compile');
      return undefined;
    }
  }

  private async disableInvalid(rule: Rule): Promise<void> {
    const error = new Error(`Rule ${rule.id} is invalid and was disabled`);
    await this.deps.onInvalidRule(rule, error);
    this.deps.notifier.publish('error.reported', { module: 'rules', message: error.message });
  }

  private report(ruleId: number, eventId: string, result: 'executed' | 'limited' | 'failed'): void {
    this.deps.notifier.publish('rule.executed', { ruleId, eventId, result });
  }
}
