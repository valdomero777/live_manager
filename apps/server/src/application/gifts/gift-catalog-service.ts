import { GiftCatalogSchema, type GiftCatalog } from '@tiklive/contracts';
import type { GiftCatalogSource } from '../ports/gift-catalog-source.js';
import type { Logger } from '../ports/logger.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import type { Clock } from '../../domain/shared/time.js';

const SETTINGS_KEY = 'gift_catalog';
/** TikTok adds gifts every few weeks; one download a day is plenty. */
export const GIFT_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export interface GiftCatalogDeps {
  readonly source: GiftCatalogSource;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * TikTok gift catalog for the rule editor's picker. Downloaded lazily, cached in app_setting so
 * the picker still works offline, and refreshed once a day (or on demand).
 */
export class GiftCatalogService {
  private cached: GiftCatalog | undefined;
  private inFlight: Promise<GiftCatalog> | undefined;

  constructor(private readonly deps: GiftCatalogDeps) {}

  async get(refresh = false): Promise<GiftCatalog> {
    const cached = this.cached ?? (await this.deps.settings.get(SETTINGS_KEY, GiftCatalogSchema));
    if (cached) this.cached = cached;
    const fresh = cached && this.deps.clock.now() - cached.fetchedAt < GIFT_CATALOG_TTL_MS;
    if (cached && fresh && !refresh) return cached;
    this.inFlight ??= this.download(cached).finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  private async download(previous: GiftCatalog | undefined): Promise<GiftCatalog> {
    try {
      const gifts = await this.deps.source.fetchGifts();
      if (gifts.length === 0) throw new Error('TikTok returned an empty gift list');
      const catalog: GiftCatalog = { gifts, fetchedAt: this.deps.clock.now(), stale: false };
      await this.deps.settings.set(SETTINGS_KEY, catalog);
      this.cached = catalog;
      return catalog;
    } catch (error) {
      this.deps.logger.warn({ err: String(error) }, 'gift catalog download failed');
      if (!previous) throw error;
      return { ...previous, stale: true };
    }
  }
}
