import {
  isAllowedSoundUrl,
  type Sound,
  type SoundLicense,
  type SoundSearchResult,
} from '@tiklive/contracts';
import { z } from 'zod';
import type { Logger } from '../../application/ports/logger.js';
import { SoundSourceError, type SoundProvider } from '../../application/ports/sound-provider.js';

export const FREESOUND_API_URL = 'https://freesound.org';
export const FREESOUND_PAGE_SIZE = 20;
/** Alerts are short; long recordings (ambiences, songs) only clutter the results. */
export const FREESOUND_MAX_DURATION_S = 30;
const REQUEST_TIMEOUT_MS = 8_000;
const SOURCE = 'freesound';

/** Official API v2 search response (https://freesound.org/docs/api/resources_apiv2.html). */
const ExternalResponseSchema = z.object({
  next: z.string().nullish(),
  results: z.array(z.unknown()),
});
const ExternalSoundSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  url: z.string(),
  duration: z.number().nonnegative().optional(),
  license: z.string(),
  username: z.string().trim().min(1),
  previews: z.object({ 'preview-hq-mp3': z.string() }),
});

/**
 * Freesound reports licences as names ("Creative Commons 0", "Attribution") or as their
 * creativecommons.org URLs. NonCommercial and Sampling+ are not safe for a monetised LIVE.
 */
export function classifyLicense(raw: string): SoundLicense | undefined {
  const value = raw.toLowerCase();
  if (value.includes('noncommercial') || value.includes('-nc') || value.includes('sampling'))
    return undefined;
  if (value.includes('creative commons 0') || value.includes('publicdomain/zero')) return 'cc0';
  if (value.startsWith('attribution') || /licenses\/by\/\d/.test(value)) return 'cc-by';
  return undefined;
}

const AUDIO_EXTENSION = /\.(wav|mp3|ogg|flac|aiff?|m4a|opus)$/i;

type Fetch = typeof fetch;

/**
 * Searches Freesound with the user's API key, sent as a header so it never lands in a URL or log.
 * The key is read on every search: changing it in Settings applies without a restart.
 */
export class FreesoundProvider implements SoundProvider {
  constructor(
    private readonly logger: Logger,
    private readonly apiKey: () => string | undefined,
    private readonly baseUrl: string = FREESOUND_API_URL,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async search(query: string, page: number): Promise<SoundSearchResult> {
    return this.list(query, page, undefined);
  }

  /** Empty query sorted by downloads: what people use most, short enough for an alert. */
  async popular(page: number): Promise<SoundSearchResult> {
    return this.list('', page, 'downloads_desc');
  }

  private async list(
    query: string,
    page: number,
    sort: 'downloads_desc' | undefined,
  ): Promise<SoundSearchResult> {
    const key = this.apiKey();
    if (!key) {
      throw new SoundSourceError('Freesound API key is not set', { reason: 'not_configured' });
    }
    const url = new URL('/apiv2/search/', this.baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(FREESOUND_PAGE_SIZE));
    url.searchParams.set('fields', 'id,name,url,previews,duration,license,username');
    url.searchParams.set('filter', `duration:[0 TO ${FREESOUND_MAX_DURATION_S}]`);
    if (sort) url.searchParams.set('sort', sort);
    const body = await this.fetchJson(url, key);
    const parsed = ExternalResponseSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.error({ err: parsed.error.message }, 'unexpected Freesound response shape');
      throw new SoundSourceError('Unexpected response from Freesound');
    }
    const results = parsed.data.results.flatMap((item) => this.normalize(item));
    return { query, page, hasNext: Boolean(parsed.data.next), results };
  }

  /** Items that are malformed, off-host or under a licence we do not accept are dropped. */
  private normalize(item: unknown): Sound[] {
    const parsed = ExternalSoundSchema.safeParse(item);
    if (!parsed.success) return [];
    const { id, name, url, duration, license, username, previews } = parsed.data;
    const mp3 = previews['preview-hq-mp3'];
    const accepted = classifyLicense(license);
    if (!accepted || !isAllowedSoundUrl(mp3, SOURCE) || !isAllowedSoundUrl(url, SOURCE)) return [];
    return [
      {
        id: String(id),
        title: name.replace(AUDIO_EXTENSION, '') || name,
        pageUrl: url,
        audioUrl: mp3,
        ...(duration === undefined ? {} : { duration }),
        source: SOURCE,
        author: username,
        license: accepted,
      },
    ];
  }

  private async fetchJson(url: URL, key: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', authorization: `Token ${key}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error({ err: String(error), host: url.host }, 'Freesound request failed');
      throw new SoundSourceError('Freesound is not reachable', { cause: error });
    }
    if (response.status === 401 || response.status === 403) {
      this.logger.warn({ status: response.status }, 'Freesound rejected the API key');
      throw new SoundSourceError('Freesound rejected the API key', { reason: 'not_configured' });
    }
    if (!response.ok) {
      this.logger.error({ status: response.status, host: url.host }, 'Freesound request failed');
      throw new SoundSourceError(`Freesound answered HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      this.logger.error({ err: String(error) }, 'Freesound returned invalid JSON');
      throw new SoundSourceError('Unexpected response from Freesound', { cause: error });
    }
  }
}
