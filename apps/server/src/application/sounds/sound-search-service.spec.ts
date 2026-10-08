import type { SoundSearchResult } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../domain/shared/time.js';
import { SoundSourceError, type SoundProvider } from '../ports/sound-provider.js';
import { SEARCH_CACHE_TTL_MS, SoundSearchService } from './sound-search-service.js';

function result(query: string, page: number): SoundSearchResult {
  return { query, page, hasNext: false, results: [] };
}

function setup(fail = false) {
  const calls: [string, number][] = [];
  const provider: SoundProvider = {
    search: (q, page) => {
      calls.push([q, page]);
      return fail ? Promise.reject(new SoundSourceError('down')) : Promise.resolve(result(q, page));
    },
  };
  const clock = new FakeClock(1_000);
  return { calls, clock, service: new SoundSearchService(provider, clock) };
}

describe('SoundSearchService', () => {
  it('normalises the query and serves repeats from cache until the TTL expires', async () => {
    const { service, calls, clock } = setup();
    await service.search('  Vine   Boom ');
    await service.search('vine boom');
    expect(calls).toEqual([['Vine Boom', 1]]);
    clock.advance(SEARCH_CACHE_TTL_MS + 1);
    await service.search('vine boom');
    expect(calls).toHaveLength(2);
  });

  it('shares one upstream call between concurrent identical searches', async () => {
    const { service, calls } = setup();
    await Promise.all([service.search('bruh'), service.search('bruh'), service.search('bruh')]);
    expect(calls).toHaveLength(1);
  });

  it('caches pages separately and clamps the page number', async () => {
    const { service, calls } = setup();
    await service.search('bruh', 1);
    await service.search('bruh', 2);
    await service.search('bruh', 9_999);
    expect(calls.map(([, page]) => page)).toEqual([1, 2, 50]);
  });

  it('does not cache failures', async () => {
    const { service, calls } = setup(true);
    await expect(service.search('bruh')).rejects.toBeInstanceOf(SoundSourceError);
    await expect(service.search('bruh')).rejects.toBeInstanceOf(SoundSourceError);
    expect(calls).toHaveLength(2);
  });
});
