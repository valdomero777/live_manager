import {
  SOUND_SOURCES,
  isAllowedSoundUrl,
  type Sound,
  type SoundSearchResult,
} from '@tiklive/contracts';
import { z } from 'zod';
import type { Logger } from '../../application/ports/logger.js';
import { SoundSourceError, type SoundProvider } from '../../application/ports/sound-provider.js';

export const DEFAULT_MYINSTANTS_API_URL = 'https://myinstants-api.vercel.app';
const REQUEST_TIMEOUT_MS = 8_000;
const SOURCE = SOUND_SOURCES[0];

/**
 * Shape of the community MyInstants API. It is unofficial and may change, which is why it is
 * parsed here and nowhere else (www.myinstants.com itself sits behind a Cloudflare challenge).
 */
const ExternalResponseSchema = z.object({
  has_next: z.boolean().nullish(),
  data: z.array(z.unknown()),
});
const ExternalSoundSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  url: z.string(),
  mp3: z.string(),
});

type Fetch = typeof fetch;

export class MyInstantsProvider implements SoundProvider {
  constructor(
    private readonly logger: Logger,
    private readonly baseUrl: string = DEFAULT_MYINSTANTS_API_URL,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async search(query: string, page: number): Promise<SoundSearchResult> {
    const url = new URL('/search', this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    const body = await this.fetchJson(url);
    const parsed = ExternalResponseSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.error({ err: parsed.error.message }, 'unexpected MyInstants response shape');
      throw new SoundSourceError('Unexpected response from MyInstants');
    }
    const results = parsed.data.data.flatMap((item) => this.normalize(item));
    return { query, page, hasNext: parsed.data.has_next === true, results };
  }

  /** Items without a playable MyInstants URL are dropped instead of failing the whole page. */
  private normalize(item: unknown): Sound[] {
    const parsed = ExternalSoundSchema.safeParse(item);
    if (!parsed.success) return [];
    const { id, title, url, mp3 } = parsed.data;
    if (!isAllowedSoundUrl(mp3, SOURCE) || !isAllowedSoundUrl(url, SOURCE)) return [];
    return [{ id, title, pageUrl: url, audioUrl: mp3, source: SOURCE }];
  }

  private async fetchJson(url: URL): Promise<unknown> {
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      this.logger.error({ err: String(error), host: url.host }, 'MyInstants request failed');
      throw new SoundSourceError('MyInstants is not reachable', { cause: error });
    }
  }
}
