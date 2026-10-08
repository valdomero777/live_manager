import type { GiftInfo } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { FakeClock } from '../../domain/shared/time.js';
import { silentLogger } from '../ports/logger.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import { GIFT_CATALOG_TTL_MS, GiftCatalogService } from './gift-catalog-service.js';

const ROSE: GiftInfo = { id: 5655, name: 'Rose', diamonds: 1 };

class MemorySettings implements SettingsRepository {
  readonly values = new Map<string, unknown>();
  async get<S extends z.ZodType>(key: string, schema: S) {
    return this.values.has(key) ? schema.parse(this.values.get(key)) : undefined;
  }
  async set(key: string, value: unknown) {
    this.values.set(key, value);
  }
}

function setup() {
  const clock = new FakeClock(1_000);
  const settings = new MemorySettings();
  const source = {
    calls: 0,
    fail: false,
    async fetchGifts() {
      source.calls++;
      if (source.fail) throw new Error('offline');
      return [ROSE];
    },
  };
  const service = new GiftCatalogService({ source, settings, clock, logger: silentLogger });
  return { clock, settings, source, service };
}

describe('GiftCatalogService', () => {
  it('downloads once and serves the cached copy while fresh', async () => {
    const { service, source } = setup();
    expect(await service.get()).toEqual({ gifts: [ROSE], fetchedAt: 1_000, stale: false });
    await service.get();
    expect(source.calls).toBe(1);
  });

  it('downloads again after a day or on demand', async () => {
    const { service, source, clock } = setup();
    await service.get();
    await service.get(true);
    clock.advance(GIFT_CATALOG_TTL_MS);
    await service.get();
    expect(source.calls).toBe(3);
  });

  it('serves the stored copy marked stale when TikTok is unreachable', async () => {
    const { service, source, clock, settings } = setup();
    await service.get();
    const restarted = new GiftCatalogService({ source, settings, clock, logger: silentLogger });
    source.fail = true;
    clock.advance(GIFT_CATALOG_TTL_MS);
    expect(await restarted.get()).toMatchObject({ gifts: [ROSE], stale: true });
  });

  it('fails when there is nothing to fall back to', async () => {
    const { service, source } = setup();
    source.fail = true;
    await expect(service.get()).rejects.toThrow('offline');
  });
});
