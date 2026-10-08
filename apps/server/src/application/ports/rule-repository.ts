import type { Rule, RuleDefinition } from '@tiklive/contracts';

export interface RuleReader {
  listAll(): Promise<Rule[]>;
  findById(id: number): Promise<Rule | undefined>;
}

export interface RuleWriter {
  create(definition: RuleDefinition): Promise<Rule>;
  /** Replaces the definition and bumps the version. Returns undefined if missing. */
  update(id: number, definition: RuleDefinition): Promise<Rule | undefined>;
  setEnabled(id: number, enabled: boolean): Promise<void>;
  delete(id: number): Promise<boolean>;
}

export type RuleRepository = RuleReader & RuleWriter;
