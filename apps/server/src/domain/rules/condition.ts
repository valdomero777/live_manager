import type { ConditionConfig, LiveEvent } from '@tiklive/contracts';
import type { ViewerActivitySnapshot } from '../session/viewer-activity.js';
import { UnknownConditionError } from '../shared/errors.js';

export type EvaluationContext = ViewerActivitySnapshot;

/** Specification pattern: one small object per condition, combined with AND. */
export interface Condition {
  readonly type: string;
  isSatisfiedBy(event: LiveEvent, ctx: EvaluationContext): boolean;
}

type ConditionFactory<T extends ConditionConfig = ConditionConfig> = (config: T) => Condition;

export class ConditionRegistry {
  private readonly factories = new Map<string, ConditionFactory>();

  register<K extends ConditionConfig['type']>(
    type: K,
    factory: ConditionFactory<Extract<ConditionConfig, { type: K }>>,
  ): this {
    this.factories.set(type, factory as ConditionFactory);
    return this;
  }

  create(config: ConditionConfig): Condition {
    const factory = this.factories.get(config.type);
    if (!factory) throw new UnknownConditionError(config.type);
    return factory(config);
  }
}
