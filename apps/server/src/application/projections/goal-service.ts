import type { Goal, GoalDefinition, GoalProgress, LiveEvent, Metric } from '@tiklive/contracts';
import { goalStatus, newlyReachedCycles } from '../../domain/projections/goal-progress.js';
import { goalMetricToMetric } from '../../domain/projections/scopes.js';
import type { GoalAdjuster } from '../actions/server-action-runner.js';
import type { ActionHandlerRegistry, AssetCatalog } from '../../domain/rules/actions.js';
import type { Clock } from '../../domain/shared/time.js';
import type { ActionSink } from '../actions/action-scheduler.js';
import type { GoalRepository } from '../ports/goal-repository.js';
import type { LeaderboardReader } from '../ports/leaderboard-repository.js';
import type { Logger } from '../ports/logger.js';
import type { IdGenerator } from '../ports/scheduler.js';

/** Goal celebrations outrank ordinary rule reactions in the per-screen queues. */
export const GOAL_ACTION_PRIORITY = 80;

export type GoalProgressView = Omit<GoalProgress, 'seq'>;

interface GoalDeps {
  readonly repo: GoalRepository;
  readonly totals: LeaderboardReader;
  readonly currentSessionId: () => number | undefined;
  readonly actions: ActionHandlerRegistry;
  readonly assets: AssetCatalog;
  readonly sink: ActionSink;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Goals as a projection over room totals (RF-15). Progress is derived, never stored; only
 * reached cycles are persisted, keyed by scope, so on_reach fires once even across restarts.
 */
export class GoalService implements GoalAdjuster {
  private goals: readonly Goal[] = [];
  private readonly listeners: ((goalId: number) => void)[] = [];

  constructor(private readonly deps: GoalDeps) {}

  async reload(): Promise<void> {
    this.goals = await this.deps.repo.listAll();
  }

  list(): readonly Goal[] {
    return this.goals;
  }

  get(id: number): Goal | undefined {
    return this.goals.find((g) => g.id === id);
  }

  async create(definition: GoalDefinition): Promise<Goal> {
    const goal = await this.deps.repo.create(definition);
    await this.reload();
    return goal;
  }

  async update(id: number, definition: GoalDefinition): Promise<Goal | undefined> {
    const goal = await this.deps.repo.update(id, definition);
    await this.reload();
    return goal;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await this.deps.repo.delete(id);
    await this.reload();
    return deleted;
  }

  /** Checks goals fed by the changed metrics; returns the ids whose progress may have moved. */
  async evaluate(event: LiveEvent, metrics: readonly Metric[]): Promise<number[]> {
    const affected = this.goals.filter(
      (g) => g.active && metrics.includes(goalMetricToMetric(g.metric)),
    );
    for (const goal of affected) await this.checkReached(goal, event.id);
    return affected.map((g) => g.id);
  }

  /** Called when a goal's progress changes without an event (manual adjustment). */
  onProgress(listener: (goalId: number) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Adds manual progress (updateGoal, RF-08). It counts like earned progress: reaching a target
   * this way celebrates once. False if the goal does not exist or has no scope yet.
   */
  async adjust(goalId: number, amount: number, eventId: string): Promise<boolean> {
    const goal = this.get(goalId);
    if (!goal) return false;
    const key = this.scopeKeyOf(goal);
    if (key === undefined) return false;
    await this.deps.repo.addAdjustment(goal.id, key, amount);
    if (goal.active) await this.checkReached(goal, eventId);
    this.listeners.forEach((notify) => notify(goal.id));
    return true;
  }

  async progress(goalId: number): Promise<GoalProgressView | undefined> {
    const goal = this.get(goalId);
    if (!goal) return undefined;
    const key = this.scopeKeyOf(goal);
    const current = key === undefined ? 0 : await this.currentValue(goal, key);
    const last = key === undefined ? 0 : await this.deps.repo.lastCycle(goal.id, key);
    const status = goalStatus(goal, current, last);
    return { goalId: goal.id, name: goal.name, metric: goal.metric, current, ...status };
  }

  private async checkReached(goal: Goal, eventId: string): Promise<void> {
    const key = this.scopeKeyOf(goal);
    if (key === undefined) return;
    const current = await this.currentValue(goal, key);
    const last = await this.deps.repo.lastCycle(goal.id, key);
    for (const cycle of newlyReachedCycles(goal, current, last)) {
      const isFirstRecord = await this.deps.repo.recordCycle(
        goal.id,
        key,
        cycle,
        this.deps.clock.now(),
      );
      if (isFirstRecord) this.celebrate(goal, cycle, current, eventId);
    }
  }

  private celebrate(goal: Goal, cycle: number, current: number, eventId: string): void {
    this.deps.logger.info({ goalId: goal.id, cycle }, 'goal reached');
    const vars = { goalName: goal.name, current: String(current), cycle: String(cycle) };
    for (const action of goal.onReach) {
      try {
        const planned = this.deps.actions.plan(action, {
          actionId: this.deps.ids.next(),
          origin: { kind: 'goal', id: goal.id },
          eventId,
          priority: GOAL_ACTION_PRIORITY,
          vars,
          assets: this.deps.assets,
        });
        if (planned) this.deps.sink.enqueue(planned);
      } catch (error) {
        this.deps.logger.error({ goalId: goal.id, err: String(error) }, 'goal action failed');
      }
    }
  }

  private scopeKeyOf(goal: Goal): string | undefined {
    if (goal.scope === 'total') return 'total';
    const sessionId = this.deps.currentSessionId();
    return sessionId === undefined ? undefined : `session:${sessionId}`;
  }

  private async currentValue(goal: Goal, key: string): Promise<number> {
    const earned = await this.deps.totals.roomTotal(goalMetricToMetric(goal.metric), key);
    const manual = await this.deps.repo.adjustment(goal.id, key);
    return Math.max(0, earned + manual);
  }
}
