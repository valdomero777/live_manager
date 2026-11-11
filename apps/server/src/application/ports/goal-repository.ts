import type { Goal, GoalDefinition } from '@tiklive/contracts';

export interface GoalRepository {
  listAll(): Promise<Goal[]>;
  findById(id: number): Promise<Goal | undefined>;
  create(definition: GoalDefinition): Promise<Goal>;
  update(id: number, definition: GoalDefinition): Promise<Goal | undefined>;
  delete(id: number): Promise<boolean>;
  /** Highest cycle recorded for the goal in that scope key; 0 when none. */
  lastCycle(goalId: number, scopeKey: string): Promise<number>;
  /** Records a reached cycle. False if it was already recorded (restart, race): never fire twice. */
  recordCycle(goalId: number, scopeKey: string, cycle: number, reachedAt: number): Promise<boolean>;
  /** Manual progress (updateGoal) for the goal in that scope key; 0 when none. */
  adjustment(goalId: number, scopeKey: string): Promise<number>;
  /** Units or diamonds of the goal's gift counted in that scope key; 0 when none. */
  giftTotal(goalId: number, scopeKey: string): Promise<number>;
  addGiftTotal(goalId: number, scopeKey: string, amount: number): Promise<void>;
  /** Forgets the tallies, e.g. when the goal now counts a different gift. */
  clearGiftTotals(goalId: number): Promise<void>;
  /** Adds (or subtracts) manual progress and returns the new adjustment. */
  addAdjustment(goalId: number, scopeKey: string, amount: number): Promise<number>;
}
