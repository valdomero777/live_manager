import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Logger } from '../../application/ports/logger.js';
import {
  SpotifyError,
  type PkcePair,
  type SpotifyApi,
  type SpotifyAuthClient,
  type SpotifyPlayback,
  type SpotifyProfile,
  type SpotifyTrackHit,
  type SpotifyTokens,
} from '../../application/ports/spotify-client.js';

export const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
export const SPOTIFY_API_URL = 'https://api.spotify.com';
const REQUEST_TIMEOUT_MS = 8_000;
/** RFC 7636 allows 43–128 characters; 64 random bytes give 86. */
const VERIFIER_BYTES = 64;
const DEFAULT_RETRY_AFTER_S = 5;

type Fetch = typeof fetch;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().default(''),
});

const TokenErrorSchema = z.object({ error: z.string() });

const ProfileSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullish(),
});

const ImageSchema = z.object({ url: z.string(), width: z.number().nullish() });
const TrackSchema = z.object({
  type: z.literal('track'),
  id: z.string().nullish(),
  name: z.string(),
  duration_ms: z.number().int().nonnegative(),
  artists: z.array(z.object({ name: z.string() })).default([]),
  album: z.object({ name: z.string(), images: z.array(ImageSchema).default([]) }),
  external_urls: z.object({ spotify: z.string().optional() }).default({}),
});
const SearchHitSchema = z.object({
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
  name: z.string(),
  duration_ms: z.number().int().nonnegative(),
  explicit: z.boolean().default(false),
  artists: z.array(z.object({ name: z.string() })).default([]),
});
const SearchResponseSchema = z.object({
  tracks: z.object({ items: z.array(z.unknown()).default([]) }),
});

/** Spotify's own cap for search since February 2026. */
export const SPOTIFY_SEARCH_MAX_LIMIT = 10;

const CurrentlyPlayingSchema = z.object({
  is_playing: z.boolean(),
  progress_ms: z.number().int().nonnegative().nullish(),
  item: z.unknown().nullish(),
});

const base64url = (bytes: Buffer) => bytes.toString('base64url');

/** Only open.spotify.com links reach overlays and the panel. */
function spotifyPage(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'open.spotify.com' ? url.href : null;
  } catch {
    return null;
  }
}

/** Album art is served by Spotify's CDN over https; anything else is dropped. */
function imageUrl(images: readonly z.infer<typeof ImageSchema>[]): string | null {
  const largest = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  if (!largest) return null;
  try {
    return new URL(largest.url).protocol === 'https:' ? largest.url : null;
  } catch {
    return null;
  }
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_S) * 1000;
}

/**
 * Spotify Accounts service (PKCE) and Web API over fetch. Tokens travel only in headers or form
 * bodies; logs carry the HTTP status and never a token or a response body.
 */
export class SpotifyWebClient implements SpotifyAuthClient, SpotifyApi {
  constructor(
    private readonly logger: Logger,
    private readonly fetchImpl: Fetch = fetch,
    private readonly accountsUrl: string = SPOTIFY_ACCOUNTS_URL,
    private readonly apiUrl: string = SPOTIFY_API_URL,
  ) {}

  pkce(): PkcePair {
    const verifier = base64url(randomBytes(VERIFIER_BYTES));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
  }

  state(): string {
    return base64url(randomBytes(24));
  }

  authorizeUrl(p: {
    clientId: string;
    redirectUri: string;
    scopes: readonly string[];
    state: string;
    challenge: string;
  }): string {
    const url = new URL('/authorize', this.accountsUrl);
    url.searchParams.set('client_id', p.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', p.redirectUri);
    url.searchParams.set('scope', p.scopes.join(' '));
    url.searchParams.set('state', p.state);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', p.challenge);
    return url.href;
  }

  exchangeCode(p: {
    clientId: string;
    redirectUri: string;
    code: string;
    verifier: string;
  }): Promise<SpotifyTokens> {
    return this.token({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      code_verifier: p.verifier,
    });
  }

  refresh(p: { clientId: string; refreshToken: string }): Promise<SpotifyTokens> {
    return this.token({
      grant_type: 'refresh_token',
      refresh_token: p.refreshToken,
      client_id: p.clientId,
    });
  }

  async me(accessToken: string): Promise<SpotifyProfile> {
    const response = await this.api('/v1/me', accessToken);
    const parsed = ProfileSchema.safeParse(await this.json(response));
    if (!parsed.success) throw new SpotifyError('Unexpected profile from Spotify', 'unavailable');
    return { id: parsed.data.id, displayName: parsed.data.display_name ?? null };
  }

  async currentlyPlaying(accessToken: string): Promise<SpotifyPlayback | undefined> {
    const response = await this.api('/v1/me/player/currently-playing', accessToken);
    if (response.status === 204) return undefined;
    const parsed = CurrentlyPlayingSchema.safeParse(await this.json(response));
    if (!parsed.success) {
      this.logger.error({ err: parsed.error.message }, 'unexpected Spotify playback shape');
      throw new SpotifyError('Unexpected playback from Spotify', 'unavailable');
    }
    const track = TrackSchema.safeParse(parsed.data.item);
    return {
      isPlaying: parsed.data.is_playing,
      progressMs: parsed.data.progress_ms ?? 0,
      track: track.success
        ? {
            id: track.data.id ?? '',
            title: track.data.name,
            artists: track.data.artists.map((a) => a.name),
            album: track.data.album.name,
            imageUrl: imageUrl(track.data.album.images),
            durationMs: track.data.duration_ms,
            url: spotifyPage(track.data.external_urls.spotify),
          }
        : null,
    };
  }

  async searchTracks(
    accessToken: string,
    query: string,
    limit: number,
  ): Promise<SpotifyTrackHit[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(Math.min(Math.max(1, limit), SPOTIFY_SEARCH_MAX_LIMIT)),
      market: 'from_token',
    });
    const response = await this.api(`/v1/search?${params.toString()}`, accessToken);
    const parsed = SearchResponseSchema.safeParse(await this.json(response));
    if (!parsed.success) throw new SpotifyError('Unexpected search from Spotify', 'unavailable');
    return parsed.data.tracks.items.flatMap((item) => {
      const hit = SearchHitSchema.safeParse(item);
      if (!hit.success) return [];
      return [
        {
          uri: hit.data.uri,
          title: hit.data.name,
          artists: hit.data.artists.map((a) => a.name),
          durationMs: hit.data.duration_ms,
          explicit: hit.data.explicit,
        },
      ];
    });
  }

  async addToQueue(accessToken: string, uri: string): Promise<void> {
    const params = new URLSearchParams({ uri });
    await this.api(`/v1/me/player/queue?${params.toString()}`, accessToken, 'POST');
  }

  async skipToNext(accessToken: string): Promise<void> {
    await this.api('/v1/me/player/next', accessToken, 'POST');
  }

  private async token(form: Record<string, string>): Promise<SpotifyTokens> {
    const url = new URL('/api/token', this.accountsUrl);
    const response = await this.send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
    });
    if (response.status === 400 || response.status === 401) {
      const error = TokenErrorSchema.safeParse(await response.json().catch(() => undefined));
      const code = error.success ? error.data.error : 'unknown';
      this.logger.warn({ status: response.status, error: code }, 'spotify token request refused');
      throw new SpotifyError(`Spotify refused the token request (${code})`, 'invalid_grant');
    }
    this.raiseForStatus(response, url);
    const parsed = TokenResponseSchema.safeParse(await this.json(response));
    if (!parsed.success) throw new SpotifyError('Unexpected token from Spotify', 'unavailable');
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresInS: parsed.data.expires_in,
      scope: parsed.data.scope,
    };
  }

  private async api(path: string, accessToken: string, method = 'GET'): Promise<Response> {
    const url = new URL(path, this.apiUrl);
    const response = await this.send(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (response.status === 401) throw new SpotifyError('Spotify token rejected', 'unauthorized');
    if (response.status === 403) {
      this.logger.warn({ path: url.pathname }, 'spotify refused the request (Premium or scope)');
      throw new SpotifyError('Spotify refused the request', 'forbidden');
    }
    if (response.status === 404 && url.pathname.startsWith('/v1/me/player')) {
      throw new SpotifyError('No active Spotify device', 'no_device');
    }
    this.raiseForStatus(response, url);
    return response;
  }

  private raiseForStatus(response: Response, url: URL): void {
    if (response.status === 429) {
      throw new SpotifyError('Spotify rate limit', 'rate_limited', {
        retryAfterMs: retryAfterMs(response),
      });
    }
    if (!response.ok) {
      this.logger.error({ status: response.status, path: url.pathname }, 'spotify request failed');
      throw new SpotifyError(`Spotify answered HTTP ${response.status}`, 'unavailable');
    }
  }

  private async send(url: URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error({ err: String(error), host: url.host }, 'spotify is not reachable');
      throw new SpotifyError('Spotify is not reachable', 'unavailable', { cause: error });
    }
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new SpotifyError('Spotify returned invalid JSON', 'unavailable', { cause: error });
    }
  }
}
