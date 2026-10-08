import { Injectable, inject, signal } from '@angular/core';
import type {
  Rule,
  RuleDefinition,
  RuleDefinitionInput,
  RuleTestRequest,
  RuleTestResult,
} from '@tiklive/contracts';
import { ApiClient } from '../../core/api-client';

/** Rule definition without id/version: what PUT /rules/:id expects. */
export function definitionOf(rule: Rule): RuleDefinition {
  const { id, version, ...definition } = rule;
  return definition;
}

/** Rules CRUD for the list and the editor. The server reloads the engine on every write. */
@Injectable({ providedIn: 'root' })
export class RulesStore {
  private readonly api = inject(ApiClient);
  readonly rules = signal<readonly Rule[]>([]);

  async load(): Promise<void> {
    this.rules.set(await this.api.get<Rule[]>('/rules'));
  }

  get(id: number): Promise<Rule> {
    return this.api.get<Rule>(`/rules/${id}`);
  }

  async save(id: number | undefined, definition: RuleDefinitionInput): Promise<Rule> {
    const rule =
      id === undefined
        ? await this.api.post<Rule>('/rules', definition)
        : await this.api.put<Rule>(`/rules/${id}`, definition);
    await this.load();
    return rule;
  }

  async setEnabled(rule: Rule, enabled: boolean): Promise<void> {
    await this.save(rule.id, { ...definitionOf(rule), enabled });
  }

  /** Copies are created disabled so they never double-fire by surprise. */
  async duplicate(rule: Rule): Promise<Rule> {
    return this.save(undefined, {
      ...definitionOf(rule),
      name: `${rule.name} (copia)`,
      enabled: false,
    });
  }

  async delete(id: number): Promise<void> {
    await this.api.delete(`/rules/${id}`);
    await this.load();
  }

  test(id: number, overrides: RuleTestRequest): Promise<RuleTestResult> {
    return this.api.post<RuleTestResult>(`/rules/${id}/test`, overrides);
  }
}
