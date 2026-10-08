import type { Kysely, Selectable } from 'kysely';
import type {
  AssetKind,
  AssetRecord,
  AssetRepository,
} from '../../application/ports/asset-repository.js';
import type { Database } from './schema.js';

function fromRow(row: Selectable<Database['asset']>): AssetRecord {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    filename: row.filename,
    sha256: row.sha256,
    originalName: row.original_name || row.filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
  };
}

export class SqliteAssetRepository implements AssetRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listAll(): Promise<AssetRecord[]> {
    const rows = await this.db.selectFrom('asset').selectAll().orderBy('id').execute();
    return rows.map(fromRow);
  }

  async findById(id: number): Promise<AssetRecord | undefined> {
    const row = await this.db
      .selectFrom('asset')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async findBySha(sha256: string): Promise<AssetRecord | undefined> {
    const row = await this.db
      .selectFrom('asset')
      .selectAll()
      .where('sha256', '=', sha256)
      .executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async create(asset: Omit<AssetRecord, 'id'>): Promise<AssetRecord> {
    const row = await this.db
      .insertInto('asset')
      .values({
        kind: asset.kind,
        filename: asset.filename,
        sha256: asset.sha256,
        original_name: asset.originalName,
        size_bytes: asset.sizeBytes,
        duration_ms: asset.durationMs ?? null,
        created_at: asset.createdAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return fromRow(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom('asset').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
