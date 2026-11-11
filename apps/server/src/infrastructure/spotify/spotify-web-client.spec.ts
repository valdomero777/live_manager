import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../application/ports/logger.js';
import { SpotifyError } from '../../application/ports/spotify-client.js';
import { SpotifyWebClient } from './spotify-web-client.js';

interface Sent {
  url: string;
  init: RequestInit | undefined;
}

function client(respond: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetchImpl = ((input: URL, init?: RequestInit) => {
    const entry = { url: String(input), init };
    sent.push(entry);
    return Promise.resolve(respond(entry));
  }) as unknown as typeof fetch;
  return {
    sent,
    c: new SpotifyWebClient(silentLogger, fetchImpl, 'https://accounts.test', 'https://api.test'),
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const PLAYING = {
  is_playing: true,
  progress_ms: 42_000,
  item: {
    type: 'track',
    id: 't1',
    name: 'Song',
    duration_ms: 200_000,
    artists: [{ name: 'A' }, { name: 'B' }],
    album: {
      name: 'Album',
      images: [
        { url: 'https://i.scdn.co/image/small', width: 64 },
        { url: 'https://i.scdn.co/image/big', width: 640 },
      ],
    },
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  },
};

describe('SpotifyWebClient', () => {
  it('builds an S256 PKCE pair and the authorize URL', () => {
    const { c } = client(() => json({}));
    const { verifier, challenge } = c.pkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(c.state()).not.toBe(c.state());

    const url = new URL(
      c.authorizeUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:3000/spotify/callback',
        scopes: ['a', 'b'],
        state: 's',
        challenge,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.test/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:3000/spotify/callback',
      scope: 'a b',
      state: 's',
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
  });

  it('exchanges the code as a form body without a client secret', async () => {
    const { c, sent } = client(() =>
      json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'x y' }),
    );
    const tokens = await c.exchangeCode({
      clientId: 'cid',
      redirectUri: 'http://127.0.0.1:3000/spotify/callback',
      code: 'the-code',
      verifier: 'v',
    });
    expect(tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresInS: 3600,
      scope: 'x y',
    });
    expect(sent[0]!.url).toBe('https://accounts.test/api/token');
    const body = new URLSearchParams(sent[0]!.init?.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: 'http://127.0.0.1:3000/spotify/callback',
      client_id: 'cid',
      code_verifier: 'v',
    });
    expect(JSON.stringify(sent[0]!.init?.headers)).not.toContain('authorization');
  });

  it('reports a refused refresh token as invalid_grant', async () => {
    const { c } = client(() => json({ error: 'invalid_grant' }, 400));
    await expect(c.refresh({ clientId: 'cid', refreshToken: 'old' })).rejects.toMatchObject({
      reason: 'invalid_grant',
    });
  });

  it('normalises the playing track and sends the token as a bearer header', async () => {
    const { c, sent } = client(() => json(PLAYING));
    const playback = await c.currentlyPlaying('at');
    expect(sent[0]!.url).toBe('https://api.test/v1/me/player/currently-playing');
    expect(sent[0]!.init?.headers).toMatchObject({ authorization: 'Bearer at' });
    expect(playback).toEqual({
      isPlaying: true,
      progressMs: 42_000,
      track: {
        id: 't1',
        title: 'Song',
        artists: ['A', 'B'],
        album: 'Album',
        imageUrl: 'https://i.scdn.co/image/big',
        durationMs: 200_000,
        url: 'https://open.spotify.com/track/t1',
      },
    });
  });

  it('returns nothing for 204 and no track for an episode or ad', async () => {
    expect(await client(() => new Response(null, { status: 204 })).c.currentlyPlaying('at')).toBe(
      undefined,
    );
    const ad = await client(() =>
      json({ is_playing: true, progress_ms: 5, item: null }),
    ).c.currentlyPlaying('at');
    expect(ad).toEqual({ isPlaying: true, progressMs: 5, track: null });
  });

  it('drops links that are not open.spotify.com or https images', async () => {
    const tampered = {
      ...PLAYING,
      item: {
        ...PLAYING.item,
        external_urls: { spotify: 'javascript:alert(1)' },
        album: { name: 'A', images: [{ url: 'http://evil.test/x.png', width: 1 }] },
      },
    };
    const playback = await client(() => json(tampered)).c.currentlyPlaying('at');
    expect(playback?.track).toMatchObject({ url: null, imageUrl: null });
  });

  it('maps 401, 429 and network failures to typed errors', async () => {
    await expect(client(() => json({}, 401)).c.me('at')).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    await expect(
      client(() => json({}, 429, { 'retry-after': '7' })).c.currentlyPlaying('at'),
    ).rejects.toMatchObject({ reason: 'rate_limited', retryAfterMs: 7_000 });
    const down = client(() => {
      throw new TypeError('fetch failed');
    });
    const error = await down.c.me('at').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyError);
    expect(error).toMatchObject({ reason: 'unavailable' });
  });
});
