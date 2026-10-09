import type {
  ActionConfig,
  LiveEvent,
  Rule,
  RuleTestResult,
  ServerActionConfig,
} from '@tiklive/contracts';
import type { ActionHandlerRegistry } from '../../domain/rules/actions.js';
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

/** Placeholders that expose viewer-written text; they always go through moderation. */
const VIEWER_TEXT_PLACEHOLDERS = ['{comment}', '{commandArgs}'];

export interface RuleEngineDeps {
  readonly rules: RuleReader;
  readonly conditions: ConditionRegistry;
  readonly actions: ActionHandlerRegistry;
  readonly limiter: RuleRateLimiter;
  readonly sink: ActionSink;
  readonly serverActions: ServerActionRunner;
  readonly assets: AssetCatalog;
  readonly moderation: () => TextFilterChain;
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
      const actionVars = vars.for(action);
      if (actionVars === null) return true; // moderated out: intentionally silent
      if (isServerAction(action))
        return this.runServerAction(rule, event, action, actionVars, dryRun);
      const planned = this.deps.actions.plan(action, {
        actionId: this.deps.ids.next(),
        origin: { kind: 'rule', id: rule.id },
        eventId: event.id,
        priority: rule.rule.priority,
        vars: actionVars,
        assets: this.deps.assets,
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
