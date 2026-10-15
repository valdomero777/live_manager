import {
  SOUND_PAGE_MAX,
  SOUND_QUERY_MAX,
  type SoundSearchResult,
  type SoundSource,
} from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { SoundProvider } from '../ports/sound-provider.js';

export const SEARCH_CACHE_TTL_MS = 5 * 60_000;
export const SEARCH_CACHE_MAX_ENTRIES = 200;

function clampPage(page: number): number {
  return Math.min(Math.max(1, Math.trunc(page)), SOUND_PAGE_MAX);
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: SoundSearchResult;
}

/**
 * Sits between the HTTP route and the providers: identical searches within the TTL are served from
 * memory and concurrent identical searches share one upstream call. Failures are never cached.
 */
export class SoundSearchService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<SoundSearchResult>>();

  constructor(
    private readonly providers: Readonly<Record<SoundSource, SoundProvider>>,
    private readonly clock: Clock,
  ) {}

  search(source: SoundSource, rawQuery: string, page = 1): Promise<SoundSearchResult> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, SOUND_QUERY_MAX);
    const safePage = clampPage(page);
    return this.cached(`${source}|${query.toLowerCase()}|${safePage}`, () =>
      this.providers[source].search(query, safePage),
    );
  }

  /**
   * Most downloaded sounds of a catalogue. A catalogue without such a list answers an empty page
   * instead of failing, so the dashboard can show «not available» next to it.
   */
  popular(source: SoundSource, page = 1): Promise<SoundSearchResult> {
    const safePage = clampPage(page);
    const provider = this.providers[source];
    if (!provider.popular) {
      return Promise.resolve({ query: '', page: safePage, hasNext: false, results: [] });
    }
    return this.cached(`${source}|popular|${safePage}`, () => provider.popular!(safePage));
  }

  private cached(key: string, load: () => Promise<SoundSearchResult>): Promise<SoundSearchResult> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.clock.now()) return Promise.resolve(cached.value);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = load()
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
