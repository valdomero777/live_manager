import { GoalSchema, type Goal, type GoalDefinition } from '@tiklive/contracts';
import type { Kysely, Selectable } from 'kysely';
import type { GoalRepository } from '../../application/ports/goal-repository.js';
import type { Database } from './schema.js';

type GoalRow = Selectable<Database['goal']>;

function toRow(def: GoalDefinition) {
  return {
    name: def.name,
    metric: def.metric,
    target: def.target,
    scope: def.scope,
    on_reach: JSON.stringify(def.onReach),
    repeat_factor: def.repeatFactor,
    active: def.active ? 1 : 0,
  };
}

/** Rows are validated with the shared schema on the way out. */
function fromRow(row: GoalRow): Goal {
  return GoalSchema.parse({
    id: row.id,
    name: row.name,
    metric: row.metric,
    target: row.target,
    scope: row.scope,
    onReach: row.on_reach === null ? [] : (JSON.parse(row.on_reach) as unknown),
    repeatFactor: row.repeat_factor,
    active: row.active === 1,
  });
}

export class SqliteGoalRepository implements GoalRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listAll(): Promise<Goal[]> {
    const rows = await this.db.selectFrom('goal').selectAll().orderBy('id').execute();
    return rows.map(fromRow);
  }

  async findById(id: number): Promise<Goal | undefined> {
    const row = await this.db
      .selectFrom('goal')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async create(definition: GoalDefinition): Promise<Goal> {
    const row = await this.db
      .insertInto('goal')
      .values(toRow(definition))
      .returningAll()
      .executeTakeFirstOrThrow();
    return fromRow(row);
  }

  async update(id: number, definition: GoalDefinition): Promise<Goal | undefined> {
    const row = await this.db
      .updateTable('goal')
      .set(toRow(definition))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom('goal').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async lastCycle(goalId: number, scopeKey: string): Promise<number> {
    const row = await this.db
      .selectFrom('goal_cycle')
      .select((eb) => eb.fn.max('cycle').as('last'))
      .where('goal_id', '=', goalId)
      .where('scope_key', '=', scopeKey)
      .executeTakeFirst();
    return Number(row?.last ?? 0);
  }

  async recordCycle(
    goalId: number,
    scopeKey: string,
    cycle: number,
    reachedAt: number,
  ): Promise<boolean> {
    const result = await this.db
      .insertInto('goal_cycle')
      .values({ goal_id: goalId, scope_key: scopeKey, cycle, reached_at: reachedAt })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
  }

  async adjustment(goalId: number, scopeKey: string): Promise<number> {
    const row = await this.db
      .selectFrom('goal_adjustment')
      .select('amount')
      .where('goal_id', '=', goalId)
      .where('scope_key', '=', scopeKey)
      .executeTakeFirst();
    return row?.amount ?? 0;
  }

  async addAdjustment(goalId: number, scopeKey: string, amount: number): Promise<number> {
    const row = await this.db
      .insertInto('goal_adjustment')
      .values({ goal_id: goalId, scope_key: scopeKey, amount })
      .onConflict((oc) =>
        oc.columns(['goal_id', 'scope_key']).doUpdateSet((eb) => ({
          amount: eb('goal_adjustment.amount', '+', amount),
        })),
      )
      .returning('amount')
      .executeTakeFirstOrThrow();
    return row.amount;
  }
}
