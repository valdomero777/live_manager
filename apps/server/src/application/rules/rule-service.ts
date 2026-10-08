import type { Rule, RuleDefinition, RuleTestRequest, RuleTestResult } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { IdGenerator } from '../ports/scheduler.js';
import type { RuleRepository } from '../ports/rule-repository.js';
import type { RuleEngine } from './rule-engine.js';
import { sampleEvent } from './sample-event.js';

export interface RuleTestContext {
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly currentSessionId: () => number | undefined;
}

/** Rule CRUD with hot reload: every write recompiles and swaps the engine's rule set. */
export class RuleService {
  constructor(
    private readonly repo: RuleRepository,
    private readonly engine: RuleEngine,
    private readonly testContext: RuleTestContext,
  ) {}

  /** Runs one rule against a sample event built from its trigger; undefined if missing. */
  async test(id: number, overrides: RuleTestRequest): Promise<RuleTestResult | undefined> {
    const rule = await this.repo.findById(id);
    if (!rule) return undefined;
    const { ids, clock, currentSessionId } = this.testContext;
    const event = sampleEvent(rule.trigger, overrides, {
      id: ids.next(),
      sessionId: currentSessionId() ?? 0,
      occurredAt: clock.now(),
    });
    return this.engine.test(rule, event);
  }

  list(): Promise<Rule[]> {
    return this.repo.listAll();
  }

  get(id: number): Promise<Rule | undefined> {
    return this.repo.findById(id);
  }

  async create(definition: RuleDefinition): Promise<Rule> {
    const rule = await this.repo.create(definition);
    await this.engine.reload();
    return rule;
  }

  async update(id: number, definition: RuleDefinition): Promise<Rule | undefined> {
    const rule = await this.repo.update(id, definition);
    if (rule) await this.applied(id);
    return rule;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await this.repo.delete(id);
    if (deleted) await this.applied(id);
    return deleted;
  }

  private async applied(id: number): Promise<void> {
    this.engine.forgetLimits(id);
    await this.engine.reload();
  }
}
