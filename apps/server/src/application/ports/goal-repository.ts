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
}
