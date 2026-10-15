import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../application/ports/logger.js';
import { SoundSourceError } from '../../application/ports/sound-provider.js';
import { MyInstantsHtmlProvider } from './myinstants-html-provider.js';

/** Mirrors the markup of https://www.myinstants.com/en/search/ (captured 2026-10-15). */
function item(path: string, slug: string, title: string, loader = '1'): string {
  return `<div class="instant">
<button class="small-button" onclick="play('${path}', 'loader-${loader}', '${slug}')" title="Play ${title} sound" type="button"></button>
<div id="loader-${loader}" class="loader"></div>
<a href="/en/instant/${slug}/" class="instant-link link-secondary">${title}</a>
</div>`;
}

const VINE = item(
  '/media/sounds/vine-boom.mp3',
  'vine-boom-sound-70972',
  'VINE BOOM SOUND',
  '81126',
);
const page = (...items: string[]) => `<html><body>${items.join('\n')}</body></html>`;

function provider(respond: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetchImpl = ((input: URL) => {
    urls.push(String(input));
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  return {
    urls,
    provider: new MyInstantsHtmlProvider(silentLogger, 'https://www.myinstants.com', fetchImpl),
  };
}

const html = (body: string, init?: ResponseInit) => new Response(body, init);

describe('MyInstantsHtmlProvider', () => {
  it('extracts sounds from the search page and sends the query and page', async () => {
    const { provider: p, urls } = provider(() => html(page(VINE)));
    const out = await p.search('vine boom', 2);
    expect(urls[0]).toBe('https://www.myinstants.com/en/search/?name=vine+boom&page=2');
    expect(out).toEqual({
      query: 'vine boom',
      page: 2,
      hasNext: false,
      results: [
        {
          id: 'vine-boom-sound-70972',
          title: 'VINE BOOM SOUND',
          pageUrl: 'https://www.myinstants.com/en/instant/vine-boom-sound-70972/',
          audioUrl: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
          source: 'myinstants',
        },
      ],
    });
  });

  it('omits the page parameter on the first page and decodes HTML entities in titles', async () => {
    const { provider: p, urls } = provider(() =>
      html(page(item('/media/sounds/a.mp3', 'rock-roll-1', 'Rock &amp; Roll &#x27;n&#39; more'))),
    );
    const out = await p.search('rock', 1);
    expect(urls[0]).toBe('https://www.myinstants.com/en/search/?name=rock');
    expect(out.results[0]?.title).toBe("Rock & Roll 'n' more");
  });

  it('reports hasNext when the page is full and deduplicates repeated items', async () => {
    const full = Array.from({ length: 36 }, (_, i) =>
      item(`/media/sounds/s${i}.mp3`, `sound-${i}`, `Sound ${i}`, String(i)),
    );
    const { provider: p } = provider(() => html(page(...full, full[0] ?? '')));
    const out = await p.search('x', 1);
    expect(out.results).toHaveLength(36);
    expect(out.hasNext).toBe(true);
  });

  it('drops items without a title or that point outside MyInstants', async () => {
    const evil = item('https://evil.example/a.mp3', 'evil-1', 'Evil');
    const lookalike = item('https://myinstants.com.evil.example/a.mp3', 'look-1', 'Look');
    const noTitle = `<button onclick="play('/media/sounds/n.mp3', 'loader-9', 'no-title-9')"></button>`;
    const { provider: p } = provider(() => html(page(evil, lookalike, noTitle, VINE)));
    const out = await p.search('x', 1);
    expect(out.results.map((s) => s.id)).toEqual(['vine-boom-sound-70972']);
  });

  it('treats 404 as an empty result set', async () => {
    const { provider: p } = provider(() => html('Not found', { status: 404 }));
    expect(await p.search('zzzz', 1)).toEqual({
      query: 'zzzz',
      page: 1,
      hasNext: false,
      results: [],
    });
  });

  it('throws SoundSourceError on HTTP errors, network errors and Cloudflare challenges', async () => {
    const rejected = (p: ReturnType<typeof provider>) =>
      expect(p.provider.search('x', 1)).rejects.toBeInstanceOf(SoundSourceError);
    await rejected(provider(() => html('', { status: 503 })));
    await rejected(
      provider(() => html('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })),
    );
    await rejected(provider(() => Promise.reject(new Error('ECONNRESET'))));
    await rejected(provider(() => html('<title>Just a moment...</title>')));
  });
});
