import {
  SPOTIFY_SCOPES,
  type SpotifyNowPlaying,
  type SpotifyProblem,
  type SpotifyStatus,
} from '@tiklive/contracts';
import { z } from 'zod';
import type { Clock } from '../../domain/shared/time.js';
import type { Logger } from '../ports/logger.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import {
  SpotifyError,
  type SpotifyApi,
  type SpotifyAuthClient,
  type SpotifyPlayback,
  type SpotifyTrackHit,
  type SpotifyTokens,
} from '../ports/spotify-client.js';

/** app_setting key holding the refresh token (local SQLite, never sent to the browser). */
export const SPOTIFY_CONNECTION_KEY = 'spotify.connection';
/** How long the user has to approve access in Spotify before the started login expires. */
export const PENDING_AUTH_TTL_MS = 10 * 60_000;
const MAX_PENDING_AUTH = 5;
/** Refresh a little before Spotify's expiry so a request never carries a dying token. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
/** Several overlays or panel tabs asking at once share one call to Spotify. */
export const NOW_PLAYING_CACHE_MS = 2_000;

/** Search results looked at per song request (Spotify allows at most 10). */
export const SONG_REQUEST_CANDIDATES = 5;
/** Queue and skip calls allowed per minute, whatever the rules say: protects the stream. */
export const PLAYBACK_CALLS_PER_MINUTE = 20;
const MINUTE_MS = 60_000;

export interface SongRequestPolicy {
  readonly allowExplicit: boolean;
  readonly maxDurationMs: number;
}

/** The best search hit the policy accepts (Spotify returns the best match first). */
export function pickTrack(
  hits: readonly SpotifyTrackHit[],
  policy: SongRequestPolicy,
): SpotifyTrackHit | undefined {
  return hits.find(
    (hit) =>
      (policy.allowExplicit || !hit.explicit) &&
      hit.durationMs > 0 &&
      hit.durationMs <= policy.maxDurationMs,
  );
}

/** Used when a 429 comes without Retry-After. */
const DEFAULT_RETRY_AFTER_MS = 5_000;

function toNowPlaying(playback: SpotifyPlayback | undefined, fetchedAt: number): SpotifyNowPlaying {
  const track = playback?.track;
  return {
    isPlaying: playback?.isPlaying ?? false,
    progressMs: playback?.progressMs ?? 0,
    track: track ? { ...track, artists: [...track.artists] } : null,
    fetchedAt,
  };
}

const StoredConnectionSchema = z.object({
  /** The refresh token belongs to this app; another Client ID means connecting again. */
  clientId: z.string(),
  refreshToken: z.string().min(1),
  scope: z.string(),
  account: z.string().nullable(),
  connectedAt: z.number(),
});
type StoredConnection = z.infer<typeof StoredConnectionSchema>;

export type SpotifyConnectionFailure =
  'not_configured' | 'not_connected' | 'invalid_state' | 'denied' | 'invalid_callback' | 'busy';

/** A request the user can fix (connect first, retry the login); mapped to 4xx by the routes. */
export class SpotifyConnectionError extends Error {
  constructor(readonly code: SpotifyConnectionFailure) {
    super(code);
    this.name = 'SpotifyConnectionError';
  }
}

interface PendingAuth {
  readonly verifier: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly expiresAt: number;
}

interface SpotifyDeps {
  /** Read on every call: a new Client ID from Settings applies without a restart. */
  readonly clientId: () => string;
  readonly redirectUri: () => string;
  readonly auth: SpotifyAuthClient;
  readonly api: SpotifyApi;
  readonly store: SettingsRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Connects the streamer's Spotify account (Authorization Code + PKCE) and reads what is playing.
 * The refresh token is stored locally; the access token only lives in memory.
 */
export class SpotifyService {
  private readonly pending = new Map<string, PendingAuth>();
  private access: { token: string; expiresAt: number } | undefined;
  private refreshing: Promise<string> | undefined;
  private problem: SpotifyProblem | null = null;
  private cached: SpotifyNowPlaying | undefined;
  private blockedUntil = 0;
  private playbackCalls: number[] = [];

  constructor(private readonly deps: SpotifyDeps) {}

  async status(): Promise<SpotifyStatus> {
    const stored = await this.connection();
    return {
      configured: this.deps.clientId() !== '',
      connected: stored !== undefined && this.problem !== 'revoked',
      account: stored?.account ?? null,
      connectedAt: stored?.connectedAt ?? null,
      redirectUri: this.deps.redirectUri(),
      scopes: [...SPOTIFY_SCOPES],
      problem: this.problem,
    };
  }

  /** Starts a login: the browser goes to the returned Spotify URL. */
  startAuthorization(): { authorizeUrl: string } {
    const clientId = this.requireClientId();
    this.prunePending();
    const { verifier, challenge } = this.deps.auth.pkce();
    const state = this.deps.auth.state();
    const redirectUri = this.deps.redirectUri();
    this.pending.set(state, {
      verifier,
      clientId,
      redirectUri,
      expiresAt: this.deps.clock.now() + PENDING_AUTH_TTL_MS,
    });
    const authorizeUrl = this.deps.auth.authorizeUrl({
      clientId,
      redirectUri,
      scopes: SPOTIFY_SCOPES,
      state,
      challenge,
    });
    return { authorizeUrl };
  }

  /** The query Spotify redirected with (`code`+`state`, or `error`+`state`). */
  async completeAuthorization(query: {
    code?: string | undefined;
    state?: string | undefined;
    error?: string | undefined;
  }): Promise<SpotifyStatus> {
    const pending = query.state ? this.takePending(query.state) : undefined;
    if (!pending) throw new SpotifyConnectionError('invalid_state');
    if (query.error) {
      this.deps.logger.info({ error: query.error }, 'spotify authorization was not granted');
      throw new SpotifyConnectionError('denied');
    }
    if (!query.code) throw new SpotifyConnectionError('invalid_callback');
    const tokens = await this.deps.auth.exchangeCode({
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      code: query.code,
      verifier: pending.verifier,
    });
    if (!tokens.refreshToken) {
      throw new SpotifyError('Spotify sent no refresh token', 'unavailable');
    }
    this.remember(tokens);
    const profile = await this.deps.api.me(tokens.accessToken).catch((error: unknown) => {
      this.deps.logger.warn({ err: String(error) }, 'spotify profile could not be read');
      return undefined;
    });
    await this.save({
      clientId: pending.clientId,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      account: profile?.displayName ?? profile?.id ?? null,
      connectedAt: this.deps.clock.now(),
    });
    this.problem = null;
    this.cached = undefined;
    this.deps.logger.info({ scope: tokens.scope }, 'spotify connected');
    return this.status();
  }

  /** Same as the redirect, from the URL the user copied out of the address bar. */
  async completeFromUrl(callbackUrl: string): Promise<SpotifyStatus> {
    let url: URL;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new SpotifyConnectionError('invalid_callback');
    }
    const get = (name: string) => url.searchParams.get(name) ?? undefined;
    return this.completeAuthorization({
      code: get('code'),
      state: get('state'),
      error: get('error'),
    });
  }

  /** Forgets the tokens here. Revoking the app itself is done in the user's Spotify account. */
  async disconnect(): Promise<void> {
    await this.deps.store.set(SPOTIFY_CONNECTION_KEY, null);
    this.access = undefined;
    this.cached = undefined;
    this.problem = null;
    this.deps.logger.info({}, 'spotify disconnected');
  }

  /**
   * Cheap synchronous check for rule actions: a Client ID is set and the last refresh was not
   * refused. Whether a connection is stored is only known when the call runs.
   */
  canControlPlayback(): boolean {
    return this.deps.clientId() !== '' && this.problem !== 'revoked';
  }

  /**
   * Searches the request and queues the first acceptable song. Undefined when nothing found is
   * acceptable (explicit or too long). Needs an active Spotify device and Premium.
   */
  async queueSong(query: string, policy: SongRequestPolicy): Promise<SpotifyTrackHit | undefined> {
    this.takePlaybackSlot();
    return this.withToken(async (token) => {
      const hits = await this.deps.api.searchTracks(token, query, SONG_REQUEST_CANDIDATES);
      const track = pickTrack(hits, policy);
      if (track) await this.deps.api.addToQueue(token, track.uri);
      return track;
    });
  }

  async skip(): Promise<void> {
    this.takePlaybackSlot();
    await this.withToken((token) => this.deps.api.skipToNext(token));
    this.cached = undefined; // the overlay should show the next song at its next poll
  }

  /** Sliding one-minute window shared by queue and skip. */
  private takePlaybackSlot(): void {
    const now = this.deps.clock.now();
    this.playbackCalls = this.playbackCalls.filter((t) => now - t < MINUTE_MS);
    if (this.playbackCalls.length >= PLAYBACK_CALLS_PER_MINUTE) {
      throw new SpotifyConnectionError('busy');
    }
    this.playbackCalls.push(now);
  }

  /** A token issued to another Client ID must not keep working after the ID changes. */
  forgetSession(): void {
    this.access = undefined;
    this.cached = undefined;
    this.problem = null;
    this.pending.clear();
  }

  /**
   * What plays right now. Cached briefly; after a 429 the last reading is served until Spotify's
   * Retry-After has passed, so overlays never make the rate limit worse.
   */
  async nowPlaying(): Promise<SpotifyNowPlaying> {
    const now = this.deps.clock.now();
    const fresh = this.cached && now - this.cached.fetchedAt < NOW_PLAYING_CACHE_MS;
    if (this.cached && (fresh || now < this.blockedUntil)) return this.cached;
    try {
      const playback = await this.withToken((token) => this.deps.api.currentlyPlaying(token));
      this.problem = null;
      this.cached = toNowPlaying(playback, now);
      return this.cached;
    } catch (error) {
      if (!(error instanceof SpotifyError) || error.reason !== 'rate_limited') throw error;
      this.blockedUntil = now + (error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS);
      this.deps.logger.warn({ retryAfterMs: error.retryAfterMs }, 'spotify rate limit reached');
      if (this.cached) return this.cached;
      throw error;
    }
  }

  /** Runs a Web API call with a fresh token; a 401 refreshes once and retries. */
  private async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken();
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof SpotifyError) || error.reason !== 'unauthorized') throw error;
      this.access = undefined;
      return call(await this.accessToken());
    }
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.deps.clock.now() < this.access.expiresAt) return this.access.token;
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const clientId = this.requireClientId();
    const stored = await this.connection();
    if (!stored || this.problem === 'revoked') {
      throw new SpotifyConnectionError('not_connected');
    }
    try {
      const tokens = await this.deps.auth.refresh({ clientId, refreshToken: stored.refreshToken });
      this.remember(tokens);
      if (tokens.refreshToken && tokens.refreshToken !== stored.refreshToken) {
        await this.save({ ...stored, refreshToken: tokens.refreshToken, scope: tokens.scope });
      }
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof SpotifyError && error.reason === 'invalid_grant') {
        this.problem = 'revoked';
        this.deps.logger.warn({}, 'spotify refused the stored refresh token; connect again');
        throw new SpotifyConnectionError('not_connected');
      }
      throw error;
    }
  }

  private remember(tokens: SpotifyTokens): void {
    const lifetimeMs = Math.max(0, tokens.expiresInS * 1000 - TOKEN_EXPIRY_MARGIN_MS);
    this.access = { token: tokens.accessToken, expiresAt: this.deps.clock.now() + lifetimeMs };
  }

  /** The stored connection, if it was made with the Client ID in use now. */
  private async connection(): Promise<StoredConnection | undefined> {
    const stored = await this.deps.store.get(
      SPOTIFY_CONNECTION_KEY,
      StoredConnectionSchema.nullable(),
    );
    if (!stored || stored.clientId !== this.deps.clientId()) return undefined;
    return stored;
  }

  private save(connection: StoredConnection): Promise<void> {
    return this.deps.store.set(SPOTIFY_CONNECTION_KEY, connection);
  }

  private requireClientId(): string {
    const clientId = this.deps.clientId();
    if (!clientId) throw new SpotifyConnectionError('not_configured');
    return clientId;
  }

  /** Single use: a replayed redirect or a state from another browser is rejected. */
  private takePending(state: string): PendingAuth | undefined {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiresAt <= this.deps.clock.now()) return undefined;
    return pending;
  }

  private prunePending(): void {
    const now = this.deps.clock.now();
    for (const [state, p] of this.pending) if (p.expiresAt <= now) this.pending.delete(state);
    while (this.pending.size >= MAX_PENDING_AUTH) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) break;
      this.pending.delete(oldest);
    }
  }
}
