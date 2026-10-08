import { ASSET_MAX_BYTES, type ActionConfig, type Asset } from '@tiklive/contracts';
import { detectMediaType } from '../../domain/assets/media-type.js';
import type { Clock } from '../../domain/shared/time.js';
import type { AssetRecord, AssetRepository, AssetStorage } from '../ports/asset-repository.js';
import { ASSET_URL_PREFIX, type AssetLibrary } from './asset-library.js';

export type AssetErrorCode = 'unsupported' | 'too_large' | 'in_use' | 'not_found';

export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssetError';
  }
}

/** Something that points at assets (a rule or a goal), used to block unsafe deletes. */
export interface AssetReference {
  readonly owner: string;
  readonly actions: readonly ActionConfig[];
}

interface AssetServiceDeps {
  readonly repo: AssetRepository;
  readonly storage: AssetStorage;
  readonly library: AssetLibrary;
  readonly references: () => Promise<readonly AssetReference[]>;
  readonly sha256: (content: Uint8Array) => string;
  readonly clock: Clock;
}

const HASH_PREFIX_LENGTH = 16;
const MAX_NAME_LENGTH = 120;

export function toAssetView(a: AssetRecord): Asset {
  return {
    id: a.id,
    kind: a.kind,
    url: `${ASSET_URL_PREFIX}${a.filename}`,
    originalName: a.originalName,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt,
  };
}

function usesAsset(actions: readonly ActionConfig[], assetId: number): boolean {
  return actions.some((a) => 'assetId' in a && a.assetId === assetId);
}

/**
 * Asset library (RF-19). Type is detected from content, size is capped per kind, files are
 * renamed to their hash (identical uploads are deduplicated) and in-use assets cannot be deleted.
 */
export class AssetService {
  constructor(private readonly deps: AssetServiceDeps) {}

  list(): Asset[] {
    return this.deps.library.list().map(toAssetView);
  }

  async upload(originalName: string, content: Uint8Array): Promise<Asset> {
    const type = detectMediaType(content);
    if (!type) {
      throw new AssetError(
        'unsupported',
        'Formato no admitido: usa WAV, MP3, OGG, M4A, PNG, JPG, GIF, WebP o WebM',
      );
    }
    const max = ASSET_MAX_BYTES[type.kind];
    if (content.byteLength > max) {
      throw new AssetError(
        'too_large',
        `El archivo supera el límite de ${Math.round(max / 1024 / 1024)} MB`,
      );
    }
    const sha256 = this.deps.sha256(content);
    const existing = await this.deps.repo.findBySha(sha256);
    if (existing) return toAssetView(existing);

    const filename = `${sha256.slice(0, HASH_PREFIX_LENGTH)}.${type.ext}`;
    await this.deps.storage.write(filename, content);
    const record = await this.deps.repo.create({
      kind: type.kind,
      filename,
      sha256,
      originalName: originalName.slice(0, MAX_NAME_LENGTH) || filename,
      sizeBytes: content.byteLength,
      createdAt: this.deps.clock.now(),
    });
    await this.deps.library.refresh();
    return toAssetView(record);
  }

  async delete(id: number): Promise<void> {
    const asset = await this.deps.repo.findById(id);
    if (!asset) throw new AssetError('not_found', `No existe el asset ${id}`);
    const owners = (await this.deps.references())
      .filter((r) => usesAsset(r.actions, id))
      .map((r) => r.owner);
    if (owners.length > 0) {
      throw new AssetError('in_use', `Está en uso por: ${owners.join(', ')}`);
    }
    await this.deps.repo.delete(id);
    await this.deps.storage.remove(asset.filename);
    await this.deps.library.refresh();
  }
}
