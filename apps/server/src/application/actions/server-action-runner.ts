import type { ServerActionConfig } from '@tiklive/contracts';
import { CircuitBreaker } from '../../domain/webhook/circuit-breaker.js';
import { resolveJsonTemplate, type TemplateVariables } from '../../domain/rules/template.js';
import type { Clock } from '../../domain/shared/time.js';
import type { Logger } from '../ports/logger.js';
import type { WebhookClient } from '../ports/webhook-client.js';

/** What the runner needs from goals; GoalService implements it. */
export interface GoalAdjuster {
  adjust(goalId: number, amount: number, eventId: string): Promise<boolean>;
}

export interface ServerActionContext {
  readonly vars: TemplateVariables;
  readonly eventId: string;
  readonly ruleId: number;
}

interface RunnerDeps {
  readonly goals: GoalAdjuster;
  readonly webhook: WebhookClient;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Runs the actions that have no screen (spec 9): updateGoal and webhook. Fire and forget: the
 * ingest path never waits on the network, and a failure is logged without touching other actions.
 */
export class ServerActionRunner {
  private readonly breaker: CircuitBreaker;

  constructor(private readonly deps: RunnerDeps) {
    this.breaker = new CircuitBreaker(deps.clock);
  }

  /** True if the action was started; false if it was refused before doing anything. */
  run(action: ServerActionConfig, ctx: ServerActionContext): boolean {
    return action.type === 'updateGoal' ? this.updateGoal(action, ctx) : this.webhook(action, ctx);
  }

  private updateGoal(
    action: Extract<ServerActionConfig, { type: 'updateGoal' }>,
    ctx: ServerActionContext,
  ): boolean {
    this.deps.goals
      .adjust(action.goalId, action.amount, ctx.eventId)
      .then((found) => {
        if (!found)
          this.deps.logger.warn({ ruleId: ctx.ruleId, goalId: action.goalId }, 'goal not found');
      })
      .catch((error: unknown) =>
        this.deps.logger.error({ ruleId: ctx.ruleId, err: String(error) }, 'updateGoal failed'),
      );
    return true;
  }

  private webhook(
    action: Extract<ServerActionConfig, { type: 'webhook' }>,
    ctx: ServerActionContext,
  ): boolean {
    const host = new URL(action.url).host;
    const fields = { ruleId: ctx.ruleId, host };
    const body = resolveJsonTemplate(action.body, ctx.vars);
    if (body === undefined) {
      this.deps.logger.warn(fields, 'webhook body is not valid JSON after substitution');
      return false;
    }
    if (!this.deps.webhook.isAllowed(action.url)) {
      this.deps.logger.warn(fields, 'webhook destination is not allowed');
      return false;
    }
    if (!this.breaker.canCall(host)) {
      this.deps.logger.warn(fields, 'webhook skipped: circuit open');
      return false;
    }
    this.deps.webhook
      .send({ url: action.url, method: action.method, body })
      .then(() => this.breaker.recordSuccess(host))
      .catch((error: unknown) => {
        this.breaker.recordFailure(host);
        this.deps.logger.warn({ ...fields, err: String(error) }, 'webhook failed');
      });
    return true;
  }
}
