import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../application/ports/logger.js';
import { SoundSourceError } from '../../application/ports/sound-provider.js';
import { MyInstantsProvider } from './myinstants-provider.js';

const VINE = {
  id: 'vine-boom-sound-70972',
  title: 'VINE BOOM SOUND',
  url: 'https://www.myinstants.com/en/instant/vine-boom-sound-70972/',
  mp3: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
};

function provider(respond: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetchImpl = ((input: URL) => {
    urls.push(String(input));
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  return { urls, provider: new MyInstantsProvider(silentLogger, 'https://api.test', fetchImpl) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('MyInstantsProvider', () => {
  it('normalises the external shape and sends query and page', async () => {
    const { provider: p, urls } = provider(() => json({ has_next: true, data: [VINE] }));
    const out = await p.search('vine boom', 2);
    expect(urls[0]).toBe('https://api.test/search?q=vine+boom&page=2');
    expect(out).toEqual({
      query: 'vine boom',
      page: 2,
      hasNext: true,
      results: [
        {
          id: VINE.id,
          title: VINE.title,
          pageUrl: VINE.url,
          audioUrl: VINE.mp3,
          source: 'myinstants',
        },
      ],
    });
  });

  it('drops items that are malformed or point outside MyInstants', async () => {
    const evil = { ...VINE, id: 'x', mp3: 'https://evil.example/a.mp3' };
    const http = { ...VINE, id: 'y', mp3: 'http://www.myinstants.com/a.mp3' };
    const lookalike = { ...VINE, id: 'z', mp3: 'https://myinstants.com.evil.example/a.mp3' };
    const { provider: p } = provider(() =>
      json({ has_next: null, data: [evil, http, lookalike, { id: 'no-title' }, VINE] }),
    );
    const out = await p.search('x', 1);
    expect(out.results.map((s) => s.id)).toEqual([VINE.id]);
    expect(out.hasNext).toBe(false);
  });

  it('throws SoundSourceError on HTTP errors, network errors and unexpected bodies', async () => {
    await expect(provider(() => json({}, 503)).provider.search('x', 1)).rejects.toBeInstanceOf(
      SoundSourceError,
    );
    await expect(
      provider(() => Promise.reject(new Error('ECONNRESET'))).provider.search('x', 1),
    ).rejects.toBeInstanceOf(SoundSourceError);
    await expect(
      provider(() => json({ nope: true })).provider.search('x', 1),
    ).rejects.toBeInstanceOf(SoundSourceError);
  });
});
