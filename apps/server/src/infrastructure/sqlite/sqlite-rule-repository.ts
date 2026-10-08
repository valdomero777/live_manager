import {
  RULE_SCHEMA_VERSION,
  RuleSchema,
  type Rule,
  type RuleDefinition,
} from '@tiklive/contracts';
import type { Kysely, Selectable } from 'kysely';
import type { RuleRepository } from '../../application/ports/rule-repository.js';
import type { Database } from './schema.js';

type RuleRow = Selectable<Database['rule']>;

function toRow(def: RuleDefinition) {
  return {
    name: def.name,
    trigger: def.trigger,
    conditions: JSON.stringify(def.conditions),
    actions: JSON.stringify(def.actions),
    mode: def.mode,
    cooldown_ms: def.cooldownMs,
    user_cooldown_ms: def.userCooldownMs,
    probability: def.probability,
    priority: def.priority,
    enabled: def.enabled ? 1 : 0,
  };
}

/** Validates a stored row with the shared schema; no unvalidated JSON reaches the domain. */
export function fromRow(row: RuleRow): Rule {
  return RuleSchema.parse({
    schemaVersion: RULE_SCHEMA_VERSION,
    id: row.id,
    version: row.version,
    name: row.name,
    trigger: row.trigger,
    conditions: JSON.parse(row.conditions) as unknown,
    actions: JSON.parse(row.actions) as unknown,
    mode: row.mode,
    cooldownMs: row.cooldown_ms,
    userCooldownMs: row.user_cooldown_ms,
    probability: row.probability,
    priority: row.priority,
    enabled: row.enabled === 1,
  });
}

export class SqliteRuleRepository implements RuleRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly onCorruptRow: (id: number, error: unknown) => void = () => undefined,
  ) {}

  async listAll(): Promise<Rule[]> {
    const rows = await this.db.selectFrom('rule').selectAll().orderBy('id').execute();
    return rows.flatMap((row) => this.safeFromRow(row));
  }

  async findById(id: number): Promise<Rule | undefined> {
    const row = await this.db
      .selectFrom('rule')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? this.safeFromRow(row)[0] : undefined;
  }

  async create(definition: RuleDefinition): Promise<Rule> {
    const row = await this.db
      .insertInto('rule')
      .values(toRow(definition))
      .returningAll()
      .executeTakeFirstOrThrow();
    return fromRow(row);
  }

  async update(id: number, definition: RuleDefinition): Promise<Rule | undefined> {
    const row = await this.db
      .updateTable('rule')
      .set((eb) => ({ ...toRow(definition), version: eb('version', '+', 1) }))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.db
      .updateTable('rule')
      .set({ enabled: enabled ? 1 : 0 })
      .where('id', '=', id)
      .execute();
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom('rule').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  /** A corrupt row is reported and skipped so one bad rule never takes the engine down. */
  private safeFromRow(row: RuleRow): Rule[] {
    try {
      return [fromRow(row)];
    } catch (error) {
      this.onCorruptRow(row.id, error);
      return [];
    }
  }
}
