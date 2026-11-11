/**
 * unauthorized: the access token expired or was revoked (refresh and retry once);
 * invalid_grant: the refresh token is dead, the user must connect again;
 * rate_limited: HTTP 429, wait `retryAfterMs`;
 * unavailable: network failure, timeout or a 5xx/unexpected answer.
 */
export type SpotifyFailure = 'unauthorized' | 'invalid_grant' | 'rate_limited' | 'unavailable';

/** Raised by the Spotify adapters; tokens and response bodies never go into the message. */
export class SpotifyError extends Error {
  readonly reason: SpotifyFailure;
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    reason: SpotifyFailure,
    options?: { cause?: unknown; retryAfterMs?: number },
  ) {
    super(message, options);
    this.name = 'SpotifyError';
    this.reason = reason;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export interface SpotifyTokens {
  readonly accessToken: string;
  /** Spotify may rotate it on refresh; undefined = keep the previous one. */
  readonly refreshToken: string | undefined;
  readonly expiresInS: number;
  readonly scope: string;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** accounts.spotify.com: Authorization Code with PKCE (no client secret). */
export interface SpotifyAuthClient {
  pkce(): PkcePair;
  /** Unguessable value binding the redirect to the authorization this server started. */
  state(): string;
  authorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    scopes: readonly string[];
    state: string;
    challenge: string;
  }): string;
  exchangeCode(params: {
    clientId: string;
    redirectUri: string;
    code: string;
    verifier: string;
  }): Promise<SpotifyTokens>;
  refresh(params: { clientId: string; refreshToken: string }): Promise<SpotifyTokens>;
}

export interface SpotifyProfile {
  readonly id: string;
  readonly displayName: string | null;
}

/** Raw shape the Web API adapter returns, already validated. */
export interface SpotifyPlayback {
  readonly isPlaying: boolean;
  readonly progressMs: number;
  readonly track: {
    readonly id: string;
    readonly title: string;
    readonly artists: readonly string[];
    readonly album: string;
    readonly imageUrl: string | null;
    readonly durationMs: number;
    readonly url: string | null;
  } | null;
}

/** api.spotify.com/v1, called with a valid access token. */
export interface SpotifyApi {
  me(accessToken: string): Promise<SpotifyProfile>;
  /** Undefined when no device is playing anything (HTTP 204). */
  currentlyPlaying(accessToken: string): Promise<SpotifyPlayback | undefined>;
}
