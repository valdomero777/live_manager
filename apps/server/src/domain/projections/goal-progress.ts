/** Safety cap so a huge jump (or a tiny factor) never loops for long. */
export const MAX_CYCLES_PER_UPDATE = 50;

export interface GoalShape {
  readonly target: number;
  readonly repeatFactor: number | null;
}

export interface GoalStatus {
  /** Cycle currently being worked on (1-based). Stays at the last one once a one-shot goal is reached. */
  readonly cycle: number;
  readonly target: number;
  readonly ratio: number;
  readonly reached: boolean;
}

/** Target of cycle n: target x factor^(n-1), rounded so the bar shows whole numbers. */
export function targetForCycle(goal: GoalShape, cycle: number): number {
  if (cycle <= 1 || goal.repeatFactor === null) return goal.target;
  return Math.round(goal.target * goal.repeatFactor ** (cycle - 1));
}

/**
 * Cycles newly reached by `current`, given the last cycle already recorded. Progress is
 * cumulative: the second cycle of a 100-diamond goal with factor 2 is reached at 200.
 */
export function newlyReachedCycles(
  goal: GoalShape,
  current: number,
  lastReached: number,
): number[] {
  const out: number[] = [];
  let cycle = lastReached + 1;
  while (out.length < MAX_CYCLES_PER_UPDATE && current >= targetForCycle(goal, cycle)) {
    if (goal.repeatFactor === null && cycle > 1) break;
    out.push(cycle);
    cycle++;
  }
  return out;
}

export function goalStatus(goal: GoalShape, current: number, lastReached: number): GoalStatus {
  const isOneShotDone = goal.repeatFactor === null && lastReached >= 1;
  const cycle = isOneShotDone ? 1 : lastReached + 1;
  const target = targetForCycle(goal, cycle);
  return {
    cycle,
    target,
    ratio: Math.min(1, Math.max(0, current / target)),
    reached: isOneShotDone,
  };
}
