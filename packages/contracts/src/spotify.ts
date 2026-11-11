import { z } from 'zod';

/**
 * Spotify connection (ADR 0014). The streamer registers their own Spotify app and pastes its
 * Client ID; the server runs Authorization Code with PKCE, so no client secret exists anywhere.
 */

/** Spotify Client IDs are 32 hexadecimal characters; empty = Spotify not configured. */
export const SpotifyClientIdSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[0-9a-f]{32}$/i.test(v), 'Client ID de Spotify no válido');

/**
 * Read what is playing, and control playback for the later song-request and skip actions.
 * Asked for up front so adding those actions does not force the streamer to reconnect.
 */
export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
] as const;

/** Path of the OAuth redirect on this server; registered as http://127.0.0.1:<port><path>. */
export const SPOTIFY_CALLBACK_PATH = '/spotify/callback';

/** Why the connection is not usable, when it is not. */
export const SPOTIFY_PROBLEMS = ['revoked', 'unavailable'] as const;
export type SpotifyProblem = (typeof SPOTIFY_PROBLEMS)[number];

export const SpotifyStatusSchema = z.object({
  /** A Client ID is saved in Settings. */
  configured: z.boolean(),
  /** A refresh token is stored and was accepted the last time it was used. */
  connected: z.boolean(),
  /** Spotify display name of the connected account. */
  account: z.string().nullable(),
  connectedAt: z.number().nullable(),
  /** Exactly what to register in the Spotify developer dashboard. */
  redirectUri: z.string(),
  scopes: z.array(z.string()),
  problem: z.enum(SPOTIFY_PROBLEMS).nullable(),
});
export type SpotifyStatus = z.infer<typeof SpotifyStatusSchema>;

export const SpotifyAuthorizeResponseSchema = z.object({ authorizeUrl: z.string().url() });
export type SpotifyAuthorizeResponse = z.infer<typeof SpotifyAuthorizeResponseSchema>;

/**
 * Fallback when the browser that approved the access is not on the server's machine: the redirect
 * to 127.0.0.1 fails there, but the address bar holds the code, so the user pastes that URL.
 */
export const SpotifyCompleteRequestSchema = z.object({
  callbackUrl: z.string().trim().min(1).max(4000),
});
export type SpotifyCompleteRequest = z.infer<typeof SpotifyCompleteRequestSchema>;

export const SpotifyTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.array(z.string()),
  album: z.string(),
  /** Largest album image; null when Spotify sends none. */
  imageUrl: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  /** open.spotify.com page of the track. */
  url: z.string().nullable(),
});
export type SpotifyTrack = z.infer<typeof SpotifyTrackSchema>;

export const SpotifyNowPlayingSchema = z.object({
  isPlaying: z.boolean(),
  /** Null when nothing plays or the item is not a track (ads, podcasts). */
  track: SpotifyTrackSchema.nullable(),
  progressMs: z.number().int().nonnegative(),
  /** Server time of the reading, to extrapolate the progress bar. */
  fetchedAt: z.number(),
});
export type SpotifyNowPlaying = z.infer<typeof SpotifyNowPlayingSchema>;
