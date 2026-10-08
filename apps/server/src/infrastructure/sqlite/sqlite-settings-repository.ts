import type { Kysely } from 'kysely';
import type { z } from 'zod';
import type { SettingsRepository } from '../../application/ports/settings-repository.js';
import type { Database } from './schema.js';

/** JSON values in app_setting; an unparsable or invalid value reads as undefined (defaults apply). */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async get<S extends z.ZodType>(key: string, schema: S): Promise<z.infer<S> | undefined> {
    const row = await this.db
      .selectFrom('app_setting')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return undefined;
    try {
      const parsed = schema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    await this.db
      .insertInto('app_setting')
      .values({ key, value: json })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: json }))
      .execute();
  }
}
