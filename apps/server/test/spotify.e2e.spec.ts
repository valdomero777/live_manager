import { API_PREFIX, type SpotifyNowPlaying, type SpotifyStatus } from '@tiklive/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import type { SpotifyApi, SpotifyAuthClient } from '../src/application/ports/spotify-client.js';
import { startTestApp, TEST_OVERLAY_KEY as KEY, type TestApp } from './support/test-app.js';

const CLIENT_ID = '0123456789abcdef0123456789abcdef';

const fakeSpotify: SpotifyAuthClient & SpotifyApi = {
  pkce: () => ({ verifier: 'v'.repeat(43), challenge: 'c' }),
  state: (() => {
    let n = 0;
    return () => `state-${++n}`;
  })(),
  authorizeUrl: (p) =>
    `https://accounts.spotify.com/authorize?client_id=${p.clientId}&state=${p.state}`,
  exchangeCode: () =>
    Promise.resolve({ accessToken: 'at', refreshToken: 'rt', expiresInS: 3600, scope: 's' }),
  refresh: () =>
    Promise.resolve({ accessToken: 'at2', refreshToken: undefined, expiresInS: 3600, scope: 's' }),
  me: () => Promise.resolve({ id: 'u1', displayName: 'Klitch' }),
  currentlyPlaying: () =>
    Promise.resolve({
      isPlaying: true,
      progressMs: 10,
      track: {
        id: 't1',
        title: 'Song',
        artists: ['Artist'],
        album: 'Album',
        imageUrl: null,
        durationMs: 1000,
        url: null,
      },
    }),
};

describe('Spotify connection', () => {
  let t: TestApp;
  afterEach(() => t.stop());

  const start = (env: Record<string, string> = { SPOTIFY_CLIENT_ID: CLIENT_ID }) =>
    startTestApp(env, { spotifyClient: fakeSpotify }).then((app) => (t = app));

  const authorize = async () => {
    const res = await t.api({ method: 'POST', url: `${API_PREFIX}/spotify/authorize` });
    expect(res.statusCode).toBe(200);
    return new URL(res.json<{ authorizeUrl: string }>().authorizeUrl).searchParams.get('state');
  };

  it('asks for the Client ID first and shows the loopback redirect URI', async () => {
    await start({});
    const status = (await t.api({ url: `${API_PREFIX}/spotify/status` })).json<SpotifyStatus>();
    expect(status).toMatchObject({ configured: false, connected: false });
    expect(status.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/spotify\/callback$/);
    const res = await t.api({ method: 'POST', url: `${API_PREFIX}/spotify/authorize` });
    expect(res.statusCode).toBe(409);
  });

  it('connects through the public callback and lands back on Settings', async () => {
    await start();
    const state = await authorize();
    const callback = await t.app.http.inject({ url: `/spotify/callback?code=abc&state=${state}` });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/admin/ajustes?spotify=connected');

    const status = (await t.api({ url: `${API_PREFIX}/spotify/status` })).json<SpotifyStatus>();
    expect(status).toMatchObject({ connected: true, account: 'Klitch' });
    const playing = await t.api({ url: `${API_PREFIX}/spotify/now-playing` });
    expect(playing.json<SpotifyNowPlaying>().track?.title).toBe('Song');
  });

  it('refuses a callback whose state this server did not issue', async () => {
    await start();
    const callback = await t.app.http.inject({ url: '/spotify/callback?code=abc&state=forged' });
    expect(callback.headers.location).toBe('/admin/ajustes?spotify=invalid_state');
    expect(
      (await t.api({ url: `${API_PREFIX}/spotify/status` })).json<SpotifyStatus>().connected,
    ).toBe(false);
  });

  it('completes from a pasted URL and disconnects', async () => {
    await start();
    const state = await authorize();
    const done = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/spotify/complete`,
      payload: { callbackUrl: `http://127.0.0.1:3000/spotify/callback?code=x&state=${state}` },
    });
    expect(done.json<SpotifyStatus>().connected).toBe(true);
    const off = await t.api({ method: 'DELETE', url: `${API_PREFIX}/spotify/connection` });
    expect(off.statusCode).toBe(204);
    const playing = await t.api({ url: `${API_PREFIX}/spotify/now-playing` });
    expect(playing.statusCode).toBe(409);
  });

  it('keeps the panel routes behind the session and overlays behind the key', async () => {
    await start();
    expect((await t.app.http.inject({ url: `${API_PREFIX}/spotify/status` })).statusCode).toBe(401);
    const noKey = await t.app.http.inject({ url: '/overlay-data/spotify/now-playing' });
    expect(noKey.statusCode).toBe(401);
    const notConnected = await t.app.http.inject({
      url: `/overlay-data/spotify/now-playing?key=${KEY}`,
    });
    expect(notConnected.statusCode).toBe(409);
  });

  it('drops the connection when the Client ID changes', async () => {
    await start();
    const state = await authorize();
    await t.app.http.inject({ url: `/spotify/callback?code=abc&state=${state}` });
    await t.api({
      method: 'PATCH',
      url: `${API_PREFIX}/settings`,
      payload: { spotifyClientId: 'f'.repeat(32) },
    });
    const status = (await t.api({ url: `${API_PREFIX}/spotify/status` })).json<SpotifyStatus>();
    expect(status.connected).toBe(false);
  });
});
