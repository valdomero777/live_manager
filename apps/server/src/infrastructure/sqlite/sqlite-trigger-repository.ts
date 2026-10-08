import { TriggerSchema, type Trigger, type TriggerDefinition } from '@tiklive/contracts';
import type { Kysely, Selectable } from 'kysely';
import type { TriggerRepository } from '../../application/ports/trigger-repository.js';
import type { Database } from './schema.js';

type TriggerRow = Selectable<Database['sound_trigger']>;

function toRow(def: TriggerDefinition) {
  return {
    name: def.name,
    event: def.event,
    sound_id: def.soundId,
    sound_title: def.soundTitle,
    sound_url: def.soundUrl,
    sound_page_url: def.soundPageUrl,
    source: def.source,
    volume: def.volume,
    enabled: def.enabled ? 1 : 0,
  };
}

/** Rows are re-validated, so a tampered URL never reaches the audio screens. */
function fromRow(row: TriggerRow): Trigger {
  return TriggerSchema.parse({
    id: row.id,
    name: row.name,
    event: row.event,
    soundId: row.sound_id,
    soundTitle: row.sound_title,
    soundUrl: row.sound_url,
    soundPageUrl: row.sound_page_url,
    source: row.source,
    volume: row.volume,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SqliteTriggerRepository implements TriggerRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly onCorruptRow: (id: number, error: unknown) => void = () => undefined,
  ) {}

  async listAll(): Promise<Trigger[]> {
    const rows = await this.db.selectFrom('sound_trigger').selectAll().orderBy('id').execute();
    return rows.flatMap((row) => this.safeFromRow(row));
  }

  async findById(id: number): Promise<Trigger | undefined> {
    const row = await this.db
      .selectFrom('sound_trigger')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? this.safeFromRow(row)[0] : undefined;
  }

  async create(definition: TriggerDefinition, now: number): Promise<Trigger> {
    const row = await this.db
      .insertInto('sound_trigger')
      .values({ ...toRow(definition), created_at: now, updated_at: now })
      .returningAll()
      .executeTakeFirstOrThrow();
    return fromRow(row);
  }

  async update(
    id: number,
    definition: TriggerDefinition,
    now: number,
  ): Promise<Trigger | undefined> {
    const row = await this.db
      .updateTable('sound_trigger')
      .set({ ...toRow(definition), updated_at: now })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('sound_trigger')
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  /** A corrupt row is reported and skipped so one bad trigger never blocks the others. */
  private safeFromRow(row: TriggerRow): Trigger[] {
    try {
      return [fromRow(row)];
    } catch (error) {
      this.onCorruptRow(row.id, error);
      return [];
    }
  }
}
