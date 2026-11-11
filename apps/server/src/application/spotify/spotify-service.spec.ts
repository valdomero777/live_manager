import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { FakeClock } from '../../domain/shared/time.js';
import { silentLogger } from '../ports/logger.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import {
  SpotifyError,
  type SpotifyApi,
  type SpotifyAuthClient,
  type SpotifyPlayback,
  type SpotifyTokens,
} from '../ports/spotify-client.js';
import {
  NOW_PLAYING_CACHE_MS,
  PENDING_AUTH_TTL_MS,
  SPOTIFY_CONNECTION_KEY,
  SpotifyConnectionError,
  SpotifyService,
} from './spotify-service.js';

const CLIENT_ID = 'a'.repeat(32);
const REDIRECT = 'http://127.0.0.1:3000/spotify/callback';

class MemorySettings implements SettingsRepository {
  readonly values = new Map<string, unknown>();
  get<S extends z.ZodType>(key: string, schema: S): Promise<z.infer<S> | undefined> {
    if (!this.values.has(key)) return Promise.resolve(undefined);
    const parsed = schema.safeParse(this.values.get(key));
    return Promise.resolve(parsed.success ? parsed.data : undefined);
  }
  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }
}

const SONG: SpotifyPlayback = {
  isPlaying: true,
  progressMs: 1_000,
  track: {
    id: 't1',
    title: 'Song',
    artists: ['Artist'],
    album: 'Album',
    imageUrl: 'https://i.scdn.co/image/x',
    durationMs: 180_000,
    url: 'https://open.spotify.com/track/t1',
  },
};

function setup(options: { clientId?: string } = {}) {
  const clock = new FakeClock(1_000_000);
  const store = new MemorySettings();
  const calls: string[] = [];
  let tokenSeq = 0;
  let stateSeq = 0;
  const tokens = (refreshToken: string | undefined): SpotifyTokens => ({
    accessToken: `access-${++tokenSeq}`,
    refreshToken,
    expiresInS: 3600,
    scope: 'user-read-currently-playing',
  });
  const fake = {
    refreshFailure: undefined as SpotifyError | undefined,
    playFailures: [] as SpotifyError[],
    rotatedRefresh: undefined as string | undefined,
  };
  const auth: SpotifyAuthClient = {
    pkce: () => ({ verifier: 'verifier', challenge: 'challenge' }),
    state: () => `state-${++stateSeq}`,
    authorizeUrl: (p) => `https://accounts.test/authorize?state=${p.state}`,
    exchangeCode: (p) => {
      calls.push(`exchange:${p.code}:${p.verifier}`);
      return Promise.resolve(tokens('refresh-1'));
    },
    refresh: (p) => {
      calls.push(`refresh:${p.refreshToken}`);
      if (fake.refreshFailure) return Promise.reject(fake.refreshFailure);
      return Promise.resolve(tokens(fake.rotatedRefresh));
    },
  };
  const api: SpotifyApi = {
    me: () => Promise.resolve({ id: 'u1', displayName: 'Streamer' }),
    currentlyPlaying: (token) => {
      calls.push(`play:${token}`);
      const failure = fake.playFailures.shift();
      return failure ? Promise.reject(failure) : Promise.resolve(SONG);
    },
  };
  const access = { clientId: options.clientId ?? CLIENT_ID };
  const service = new SpotifyService({
    clientId: () => access.clientId,
    redirectUri: () => REDIRECT,
    auth,
    api,
    store,
    clock,
    logger: silentLogger,
  });
  const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? '';
  const connect = async () => {
    const { authorizeUrl } = service.startAuthorization();
    return service.completeAuthorization({ code: 'code', state: stateOf(authorizeUrl) });
  };
  return { service, clock, store, calls, fake, access, connect, stateOf };
}

describe('SpotifyService', () => {
  it('reports what to register in Spotify before anything is connected', async () => {
    const { service } = setup({ clientId: '' });
    expect(await service.status()).toMatchObject({
      configured: false,
      connected: false,
      redirectUri: REDIRECT,
      problem: null,
    });
    expect(() => service.startAuthorization()).toThrow(SpotifyConnectionError);
  });

  it('connects with PKCE and stores the refresh token with the account name', async () => {
    const { calls, store, connect } = setup();
    const status = await connect();
    expect(calls).toContain('exchange:code:verifier');
    expect(status).toMatchObject({ connected: true, account: 'Streamer', connectedAt: 1_000_000 });
    expect(store.values.get(SPOTIFY_CONNECTION_KEY)).toMatchObject({
      clientId: CLIENT_ID,
      refreshToken: 'refresh-1',
    });
  });

  it('rejects an unknown, replayed or expired state', async () => {
    const { service, clock, stateOf } = setup();
    await expect(service.completeAuthorization({ code: 'c', state: 'forged' })).rejects.toThrow(
      'invalid_state',
    );
    const state = stateOf(service.startAuthorization().authorizeUrl);
    await service.completeAuthorization({ code: 'c', state });
    await expect(service.completeAuthorization({ code: 'c', state })).rejects.toThrow(
      'invalid_state',
    );
    const late = stateOf(service.startAuthorization().authorizeUrl);
    clock.advance(PENDING_AUTH_TTL_MS);
    await expect(service.completeAuthorization({ code: 'c', state: late })).rejects.toThrow(
      'invalid_state',
    );
  });

  it('treats a cancelled login as denied', async () => {
    const { service, stateOf } = setup();
    const state = stateOf(service.startAuthorization().authorizeUrl);
    await expect(service.completeAuthorization({ error: 'access_denied', state })).rejects.toThrow(
      'denied',
    );
  });

  it('completes from a pasted callback URL', async () => {
    const { service, stateOf } = setup();
    const state = stateOf(service.startAuthorization().authorizeUrl);
    const status = await service.completeFromUrl(`${REDIRECT}?code=abc&state=${state}`);
    expect(status.connected).toBe(true);
    await expect(service.completeFromUrl('not a url')).rejects.toThrow('invalid_callback');
  });

  it('reads now playing with the cached token, then refreshes after expiry', async () => {
    const { service, calls, clock, connect } = setup();
    await connect();
    const first = await service.nowPlaying();
    expect(first).toMatchObject({
      isPlaying: true,
      track: { title: 'Song' },
      fetchedAt: 1_000_000,
    });
    expect(calls).toContain('play:access-1');

    clock.advance(NOW_PLAYING_CACHE_MS - 1);
    await service.nowPlaying();
    expect(calls.filter((c) => c.startsWith('play:'))).toHaveLength(1);

    clock.advance(3600_000);
    await service.nowPlaying();
    expect(calls).toContain('refresh:refresh-1');
    expect(calls.at(-1)).toBe('play:access-2');
  });

  it('refreshes once and retries when Spotify rejects the token', async () => {
    const { service, calls, fake, connect } = setup();
    await connect();
    fake.playFailures.push(new SpotifyError('expired', 'unauthorized'));
    expect((await service.nowPlaying()).track?.id).toBe('t1');
    expect(calls.filter((c) => c.startsWith('refresh:'))).toHaveLength(1);
  });

  it('stores a rotated refresh token', async () => {
    const { service, store, fake, clock, connect } = setup();
    await connect();
    fake.rotatedRefresh = 'refresh-2';
    clock.advance(3600_000);
    await service.nowPlaying();
    expect(store.values.get(SPOTIFY_CONNECTION_KEY)).toMatchObject({ refreshToken: 'refresh-2' });
  });

  it('marks the connection revoked when the refresh token is refused', async () => {
    const { service, fake, clock, connect } = setup();
    await connect();
    fake.refreshFailure = new SpotifyError('bad', 'invalid_grant');
    clock.advance(3600_000);
    await expect(service.nowPlaying()).rejects.toThrow('not_connected');
    expect(await service.status()).toMatchObject({ connected: false, problem: 'revoked' });
  });

  it('serves the last reading while Spotify asks to wait', async () => {
    const { service, fake, clock, calls, connect } = setup();
    await connect();
    await service.nowPlaying();
    clock.advance(NOW_PLAYING_CACHE_MS);
    fake.playFailures.push(new SpotifyError('slow down', 'rate_limited', { retryAfterMs: 10_000 }));
    expect((await service.nowPlaying()).fetchedAt).toBe(1_000_000);
    clock.advance(5_000);
    await service.nowPlaying();
    expect(calls.filter((c) => c.startsWith('play:'))).toHaveLength(2);
  });

  it('ignores a connection made with another Client ID', async () => {
    const { service, access, connect } = setup();
    await connect();
    access.clientId = 'b'.repeat(32);
    service.forgetSession();
    expect(await service.status()).toMatchObject({ connected: false, account: null });
    await expect(service.nowPlaying()).rejects.toThrow('not_connected');
  });

  it('forgets the tokens on disconnect', async () => {
    const { service, store, connect } = setup();
    await connect();
    await service.disconnect();
    expect(store.values.get(SPOTIFY_CONNECTION_KEY)).toBeNull();
    expect((await service.status()).connected).toBe(false);
    await expect(service.nowPlaying()).rejects.toThrow('not_connected');
  });
});
