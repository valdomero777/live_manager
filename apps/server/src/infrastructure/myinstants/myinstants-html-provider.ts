import {
  SOUND_SOURCES,
  isAllowedSoundUrl,
  type Sound,
  type SoundSearchResult,
} from '@tiklive/contracts';
import type { Logger } from '../../application/ports/logger.js';
import { SoundSourceError, type SoundProvider } from '../../application/ports/sound-provider.js';

export const MYINSTANTS_SITE_URL = 'https://www.myinstants.com';
/** Trending page: 36 sounds, no further pages. Used when the search text is empty. */
const POPULAR_PATH = '/en/index/us/';
const REQUEST_TIMEOUT_MS = 8_000;
/** MyInstants renders 36 results per search page and has no pagination markup. */
const PAGE_SIZE = 36;
const SOURCE = SOUND_SOURCES[0];

/** `onclick="play('/media/sounds/x.mp3', 'loader-123', 'slug')"` on each result button. */
const PLAY_RE = /onclick="play\('([^']+)',\s*'loader-\d+',\s*'([^']+)'\)/g;
/** `<a href="/en/instant/slug/" class="instant-link ...">Title</a>` on each result. */
const TITLE_RE =
  /<a href="\/[a-z]{2}\/instant\/([^/"]+)\/"\s+class="instant-link[^"]*">([^<]*)<\/a>/g;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, dec?: string, hex?: string, name?: string) => {
      if (dec || hex) {
        const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[(name ?? '').toLowerCase()] ?? match;
    },
  );
}

/** slug -> title for every result link on the page. */
function parseTitles(html: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const [, slug, title] of html.matchAll(TITLE_RE)) {
    if (slug && title) titles.set(slug, decodeEntities(title).trim());
  }
  return titles;
}

/** Unique (slug, audio path) pairs, in page order. */
function parsePlayButtons(html: string): { slug: string; path: string }[] {
  const seen = new Set<string>();
  const buttons: { slug: string; path: string }[] = [];
  for (const [, path, slug] of html.matchAll(PLAY_RE)) {
    if (!path || !slug || seen.has(slug)) continue;
    seen.add(slug);
    buttons.push({ slug, path });
  }
  return buttons;
}

type Fetch = typeof fetch;

/**
 * Reads the public MyInstants search page directly (no third-party API in between). The HTML is not
 * a contract, so every layout assumption lives in this file; items that do not match are dropped and
 * a Cloudflare challenge surfaces as a SoundSourceError so callers can fall back to another source.
 */
export class MyInstantsHtmlProvider implements SoundProvider {
  constructor(
    private readonly logger: Logger,
    private readonly siteUrl: string = MYINSTANTS_SITE_URL,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async search(query: string, page: number): Promise<SoundSearchResult> {
    if (!query && page > 1) return { query, page, hasNext: false, results: [] };
    const url = this.listUrl(query, page);
    const html = await this.fetchHtml(url);
    if (html === null) return { query, page, hasNext: false, results: [] };

    const buttons = parsePlayButtons(html);
    if (buttons.length === 0 && /Just a moment|cf-challenge|challenge-platform/i.test(html)) {
      this.logger.error({ host: url.host }, 'MyInstants served a Cloudflare challenge');
      throw new SoundSourceError('MyInstants is blocking automated requests');
    }
    const titles = parseTitles(html);
    const results = buttons.flatMap(({ slug, path }) => {
      const sound = this.normalize(slug, path, titles.get(slug));
      return sound ? [sound] : [];
    });
    return { query, page, hasNext: query !== '' && buttons.length >= PAGE_SIZE, results };
  }

  private listUrl(query: string, page: number): URL {
    if (!query) return new URL(POPULAR_PATH, this.siteUrl);
    const url = new URL('/en/search/', this.siteUrl);
    url.searchParams.set('name', query);
    if (page > 1) url.searchParams.set('page', String(page));
    return url;
  }

  private normalize(slug: string, path: string, title: string | undefined): Sound | null {
    if (!title) return null;
    try {
      const audioUrl = new URL(path, this.siteUrl).href;
      const pageUrl = new URL(`/en/instant/${slug}/`, this.siteUrl).href;
      if (!isAllowedSoundUrl(audioUrl, SOURCE) || !isAllowedSoundUrl(pageUrl, SOURCE)) return null;
      return { id: slug, title, pageUrl, audioUrl, source: SOURCE };
    } catch {
      return null;
    }
  }

  /** Returns null for 404, which is how MyInstants reports "no results" (or a page past the end). */
  private async fetchHtml(url: URL): Promise<string | null> {
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 404) return null;
      if (response.headers.get('cf-mitigated')) throw new Error('Cloudflare challenge');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      this.logger.error({ err: String(error), host: url.host }, 'MyInstants request failed');
      throw new SoundSourceError('MyInstants is not reachable', { cause: error });
    }
  }
}
