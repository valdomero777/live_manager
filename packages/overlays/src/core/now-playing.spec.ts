import type { SpotifyNowPlaying } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { formatTime, progressAt, progressRatio, trackKey, visibleTrack } from './now-playing.js';

const TRACK = {
  id: 't1',
  title: 'Song',
  artists: ['A', 'B'],
  album: 'Album',
  imageUrl: null,
  durationMs: 200_000,
  url: null,
};

const reading = (over: Partial<SpotifyNowPlaying> = {}): SpotifyNowPlaying => ({
  isPlaying: true,
  progressMs: 60_000,
  track: TRACK,
  fetchedAt: 0,
  ...over,
});

describe('now playing', () => {
  it('extrapolates the progress of a playing song from the browser clock', () => {
    expect(progressAt(reading(), 1_000, 4_000)).toBe(63_000);
    expect(progressRatio(reading(), 1_000, 1_000)).toBeCloseTo(0.3);
  });

  it('keeps a paused song still and never passes the end', () => {
    expect(progressAt(reading({ isPlaying: false }), 0, 50_000)).toBe(60_000);
    expect(progressAt(reading(), 0, 10_000_000)).toBe(200_000);
    expect(progressAt(reading(), 5_000, 1_000)).toBe(60_000);
    expect(progressRatio(reading({ track: null }), 0, 0)).toBe(0);
  });

  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
    expect(formatTime(-5)).toBe('0:00');
  });

  it('shows nothing without a track, and hides a paused one on request', () => {
    expect(visibleTrack(undefined, false)).toBeNull();
    expect(visibleTrack(reading({ track: null }), false)).toBeNull();
    expect(visibleTrack(reading({ isPlaying: false }), false)).toEqual(TRACK);
    expect(visibleTrack(reading({ isPlaying: false }), true)).toBeNull();
  });

  it('changes key only when the song changes', () => {
    expect(trackKey(TRACK)).toBe(trackKey({ ...TRACK }));
    expect(trackKey(TRACK)).not.toBe(trackKey({ ...TRACK, title: 'Other' }));
    expect(trackKey(null)).toBe('');
  });
});
