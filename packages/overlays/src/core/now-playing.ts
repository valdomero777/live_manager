import type { SpotifyNowPlaying } from '@tiklive/contracts';

/**
 * Where the song is now, extrapolated from the last reading so the bar moves smoothly between
 * polls. `receivedAt` is the browser's clock when the reading arrived (the server clock may
 * differ). A paused song stays where it was; the result never passes the song's end.
 */
export function progressAt(reading: SpotifyNowPlaying, receivedAt: number, now: number): number {
  const duration = reading.track?.durationMs ?? 0;
  if (duration <= 0) return 0;
  const elapsed = reading.isPlaying ? Math.max(0, now - receivedAt) : 0;
  return Math.min(duration, reading.progressMs + elapsed);
}

/** 0–1 for the progress bar. */
export function progressRatio(reading: SpotifyNowPlaying, receivedAt: number, now: number): number {
  const duration = reading.track?.durationMs ?? 0;
  return duration > 0 ? progressAt(reading, receivedAt, now) / duration : 0;
}

/** m:ss, or h:mm:ss for long tracks. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * What the card shows: the track, or nothing. With `hideWhenPaused`, a paused song hides the
 * card too, so a stopped player never leaves a stale song on the stream.
 */
export function visibleTrack(
  reading: SpotifyNowPlaying | undefined,
  hideWhenPaused: boolean,
): SpotifyNowPlaying['track'] {
  if (!reading?.track) return null;
  if (hideWhenPaused && !reading.isPlaying) return null;
  return reading.track;
}

/** Stable identity of a song, to animate only when it changes. */
export function trackKey(track: SpotifyNowPlaying['track']): string {
  return track ? `${track.id}|${track.title}|${track.artists.join(',')}` : '';
}
