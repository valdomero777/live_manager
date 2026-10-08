import { SOUND_PAGE_MAX, SOUND_QUERY_MAX, type SoundSearchResult } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { SoundProvider } from '../ports/sound-provider.js';

export const SEARCH_CACHE_TTL_MS = 5 * 60_000;
export const SEARCH_CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: SoundSearchResult;
}

/**
 * Sits between the HTTP route and the provider: identical searches within the TTL are served from
 * memory and concurrent identical searches share one upstream call. Failures are never cached.
 */
export class SoundSearchService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<SoundSearchResult>>();

  constructor(
    private readonly provider: SoundProvider,
    private readonly clock: Clock,
  ) {}

  search(rawQuery: string, page = 1): Promise<SoundSearchResult> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, SOUND_QUERY_MAX);
    const safePage = Math.min(Math.max(1, Math.trunc(page)), SOUND_PAGE_MAX);
    const key = `${query.toLowerCase()}|${safePage}`;

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.clock.now()) return Promise.resolve(cached.value);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.provider
      .search(query, safePage)
      .then((value) => {
        this.remember(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private remember(key: string, value: SoundSearchResult): void {
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: this.clock.now() + SEARCH_CACHE_TTL_MS });
    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= SEARCH_CACHE_MAX_ENTRIES) break;
      this.cache.delete(oldest);
    }
  }
}
