import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../application/ports/logger.js';
import { SoundSourceError } from '../../application/ports/sound-provider.js';
import { FreesoundProvider, classifyLicense } from './freesound-provider.js';

const BOOM = {
  id: 33637,
  name: 'Boom.wav',
  url: 'https://freesound.org/people/HerbertBoland/sounds/33637/',
  duration: 1.6,
  license: 'http://creativecommons.org/publicdomain/zero/1.0/',
  username: 'HerbertBoland',
  previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/33/33637_35187-hq.mp3' },
};

function provider(respond: () => Response | Promise<Response>, key: string | null = 'k3y') {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = ((input: URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  const p = new FreesoundProvider(
    silentLogger,
    () => key ?? undefined,
    'https://api.test',
    fetchImpl,
  );
  return { requests, provider: p };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('FreesoundProvider', () => {
  it('normalises the API shape and sends the key as a header, not in the URL', async () => {
    const { provider: p, requests } = provider(() =>
      json({ count: 40, next: 'https://freesound.org/apiv2/search/?page=3', results: [BOOM] }),
    );
    const out = await p.search('boom', 2);

    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.test/apiv2/search/');
    expect(url.searchParams.get('query')).toBe('boom');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('filter')).toBe('duration:[0 TO 30]');
    expect(requests[0]!.url).not.toContain('k3y');
    expect(new Headers(requests[0]!.init?.headers).get('authorization')).toBe('Token k3y');

    expect(out).toEqual({
      query: 'boom',
      page: 2,
      hasNext: true,
      results: [
        {
          id: '33637',
          title: 'Boom',
          pageUrl: BOOM.url,
          audioUrl: BOOM.previews['preview-hq-mp3'],
          duration: 1.6,
          source: 'freesound',
          author: 'HerbertBoland',
          license: 'cc0',
        },
      ],
    });
  });

  it('drops NonCommercial, Sampling+, off-host and malformed items', async () => {
    const nc = { ...BOOM, id: 2, license: 'http://creativecommons.org/licenses/by-nc/3.0/' };
    const sampling = {
      ...BOOM,
      id: 3,
      license: 'http://creativecommons.org/licenses/sampling+/1.0/',
    };
    const evil = { ...BOOM, id: 4, previews: { 'preview-hq-mp3': 'https://evil.example/a.mp3' } };
    const lookalike = { ...BOOM, id: 5, url: 'https://freesound.org.evil.example/s/5/' };
    const by = { ...BOOM, id: 6, license: 'Attribution' };
    const { provider: p } = provider(() =>
      json({ next: null, results: [nc, sampling, evil, lookalike, { id: 'x' }, by, BOOM] }),
    );
    const out = await p.search('boom', 1);
    expect(out.results.map((s) => [s.id, s.license])).toEqual([
      ['6', 'cc-by'],
      ['33637', 'cc0'],
    ]);
    expect(out.hasNext).toBe(false);
  });

  it('reports a missing or rejected key as not_configured without calling out unnecessarily', async () => {
    const missing = provider(() => json({ results: [] }), null);
    await expect(missing.provider.search('boom', 1)).rejects.toMatchObject({
      reason: 'not_configured',
    });
    expect(missing.requests).toHaveLength(0);

    const rejected = provider(() => json({ detail: 'Invalid token.' }, 401));
    await expect(rejected.provider.search('boom', 1)).rejects.toMatchObject({
      reason: 'not_configured',
    });
  });

  it('throws SoundSourceError (unavailable) on HTTP errors, network errors and odd bodies', async () => {
    for (const respond of [
      () => json({}, 503),
      () => Promise.reject(new Error('ECONNRESET')),
      () => json({ nope: true }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const error: unknown = await provider(respond)
        .provider.search('boom', 1)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SoundSourceError);
      expect((error as SoundSourceError).reason).toBe('unavailable');
    }
  });
});

describe('FreesoundProvider.popular', () => {
  it('lists an empty query sorted by downloads, with the same filters and key header', async () => {
    const { provider: p, requests } = provider(() =>
      json({ count: 1, next: null, results: [BOOM] }),
    );
    const out = await p.popular(1);

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get('query')).toBe('');
    expect(url.searchParams.get('sort')).toBe('downloads_desc');
    expect(url.searchParams.get('filter')).toBe('duration:[0 TO 30]');
    expect(new Headers(requests[0]!.init?.headers).get('authorization')).toBe('Token k3y');
    expect(out).toMatchObject({ query: '', page: 1, hasNext: false, results: [{ id: '33637' }] });
  });

  it('search does not send a sort parameter', async () => {
    const { provider: p, requests } = provider(() => json({ next: null, results: [] }));
    await p.search('boom', 1);
    expect(new URL(requests[0]!.url).searchParams.has('sort')).toBe(false);
  });
});

describe('classifyLicense', () => {
  it.each([
    ['Creative Commons 0', 'cc0'],
    ['http://creativecommons.org/publicdomain/zero/1.0/', 'cc0'],
    ['Attribution', 'cc-by'],
    ['https://creativecommons.org/licenses/by/4.0/', 'cc-by'],
    ['Attribution NonCommercial', undefined],
    ['http://creativecommons.org/licenses/by-nc/4.0/', undefined],
    ['http://creativecommons.org/licenses/sampling+/1.0/', undefined],
    ['something else', undefined],
  ])('%s → %s', (raw, expected) => {
    expect(classifyLicense(raw)).toBe(expected);
  });
});
