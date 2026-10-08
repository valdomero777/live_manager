import type { AssetCatalog } from '../../domain/rules/actions.js';
import type { AssetRecord, AssetRepository } from '../ports/asset-repository.js';

export const ASSET_URL_PREFIX = '/media/';

/** In-memory index of assets so action planning resolves URLs without touching the DB. */
export class AssetLibrary implements AssetCatalog {
  private byId = new Map<number, AssetRecord>();

  constructor(private readonly repo: AssetRepository) {}

  async refresh(): Promise<void> {
    const all = await this.repo.listAll();
    this.byId = new Map(all.map((a) => [a.id, a]));
  }

  urlFor(assetId: number): string | undefined {
    const asset = this.byId.get(assetId);
    return asset ? `${ASSET_URL_PREFIX}${asset.filename}` : undefined;
  }

  list(): AssetRecord[] {
    return [...this.byId.values()];
  }

  audioUrls(): string[] {
    return this.list()
      .filter((a) => a.kind === 'audio')
      .map((a) => `${ASSET_URL_PREFIX}${a.filename}`);
  }
}
