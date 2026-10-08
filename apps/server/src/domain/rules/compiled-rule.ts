import type { ActionConfig, LiveEvent, Rule } from '@tiklive/contracts';
import type { Random } from '../shared/time.js';
import type { Condition, ConditionRegistry, EvaluationContext } from './condition.js';

/** A rule with its conditions instantiated once, so evaluation does no parsing. */
export class CompiledRule {
  private constructor(
    readonly rule: Rule,
    private readonly conditions: readonly Condition[],
  ) {}

  static compile(rule: Rule, registry: ConditionRegistry): CompiledRule {
    return new CompiledRule(
      rule,
      rule.conditions.map((c) => registry.create(c)),
    );
  }

  get id(): number {
    return this.rule.id;
  }

  matchesTrigger(event: LiveEvent): boolean {
    return this.rule.enabled && this.rule.trigger === event.type;
  }

  conditionsHold(event: LiveEvent, ctx: EvaluationContext): boolean {
    return this.conditions.every((c) => c.isSatisfiedBy(event, ctx));
  }

  /** Per-condition outcome, for the dashboard's rule test. */
  explain(event: LiveEvent, ctx: EvaluationContext): { type: string; ok: boolean }[] {
    return this.conditions.map((c) => ({ type: c.type, ok: c.isSatisfiedBy(event, ctx) }));
  }

  /** mode 'all' runs every action; 'random' picks one uniformly. */
  selectActions(random: Random): readonly ActionConfig[] {
    const { actions, mode } = this.rule;
    if (mode === 'all' || actions.length <= 1) return actions;
    const index = Math.min(actions.length - 1, Math.floor(random.next() * actions.length));
    const picked = actions[index];
    return picked ? [picked] : [];
  }
}

/** Highest priority first; ties keep rule id order for determinism. */
export function byPriority(a: CompiledRule, b: CompiledRule): number {
  return b.rule.priority - a.rule.priority || a.id - b.id;
}
