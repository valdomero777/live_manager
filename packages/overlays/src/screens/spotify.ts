import { SpotifyNowPlayingSchema, type SpotifyNowPlaying } from '@tiklive/contracts';
import { el } from '../core/dom.js';
import {
  formatTime,
  progressAt,
  progressRatio,
  trackKey,
  visibleTrack,
} from '../core/now-playing.js';
import { readChoice, readCommonParams, readNumber } from '../core/params.js';
import { applyTheme } from '../core/theme.js';

/**
 * The song playing on the streamer's Spotify (ADR 0014, phase 2). It polls the server, which
 * caches Spotify for 2 s and respects its rate limit, so several copies of this overlay are cheap.
 * Between polls the progress bar is extrapolated locally. With nothing playing, the card hides.
 */
const query = new URLSearchParams(location.search);
const params = readCommonParams();
const pollMs = readNumber('interval', 5, 3, 30) * 1000;
const layout = readChoice('layout', ['card', 'compact'] as const, 'card');
const showArt = query.get('art') !== '0';
const showProgress = query.get('progress') !== '0';
const hideWhenPaused = readChoice('paused', ['hide', 'show'] as const, 'hide') === 'hide';
const label = query.get('title')?.slice(0, 40) ?? '';

/** Longest wait after errors or a 429 without Retry-After. */
const MAX_BACKOFF_MS = 60_000;
const TICK_MS = 1_000;

applyTheme();

const stage = document.querySelector<HTMLElement>('#stage');
const debug = document.querySelector<HTMLElement>('#debug');
const showDebug = (text: string) => {
  if (!params.debug || !debug) return;
  debug.hidden = false;
  debug.textContent = text;
};
params.warnings.forEach(showDebug);

const card = el('section', `panel spotify spotify--${layout} spotify--hidden`);
card.setAttribute('aria-live', 'polite');
const art = el('img', 'spotify__art');
art.alt = '';
art.referrerPolicy = 'no-referrer';
art.decoding = 'async';
const artFallback = el('span', 'spotify__art spotify__art--empty', '♪');
const info = el('div', 'spotify__info');
const labelEl = el('span', 'spotify__label', label);
const title = el('span', 'spotify__title');
const artists = el('span', 'spotify__artists');
const bar = el('div', 'spotify__bar');
const fill = el('div', 'spotify__fill');
const time = el('span', 'spotify__time');
bar.append(fill);
info.append(...(label ? [labelEl] : []), title, artists);
if (showProgress) info.append(bar, time);
if (showArt) card.append(art);
card.append(info);
stage?.append(card);

art.addEventListener('error', () => {
  if (art.isConnected) art.replaceWith(artFallback);
});

let reading: SpotifyNowPlaying | undefined;
let receivedAt = 0;
let shownKey = '';

function render(): void {
  const track = visibleTrack(reading, hideWhenPaused);
  card.classList.toggle('spotify--hidden', !track);
  card.classList.toggle('spotify--paused', reading?.isPlaying === false);
  if (!track || !reading) {
    shownKey = '';
    return;
  }
  const key = trackKey(track);
  if (key !== shownKey) {
    shownKey = key;
    title.textContent = track.title;
    artists.textContent = track.artists.join(', ');
    if (showArt) setArt(track.imageUrl);
    card.classList.remove('spotify--new');
    void card.offsetWidth; // restart the entrance animation
    card.classList.add('spotify--new');
  }
  tick();
}

function setArt(url: string | null): void {
  const current = art.isConnected ? art : artFallback;
  if (!url) {
    current.replaceWith(artFallback);
    return;
  }
  art.src = url;
  current.replaceWith(art);
}

/** Moves the bar and the clock; runs every second between polls. */
function tick(): void {
  if (!showProgress || !reading?.track) return;
  const now = Date.now();
  fill.style.transform = `scaleX(${progressRatio(reading, receivedAt, now)})`;
  time.textContent = `${formatTime(progressAt(reading, receivedAt, now))} / ${formatTime(reading.track.durationMs)}`;
}

/** 409 = Spotify not connected: hide quietly on stream and explain only with ?debug=1. */
const STATUS_TEXT: Readonly<Record<number, string>> = {
  401: 'Spotify: clave de overlay incorrecta',
  409: 'Spotify no está conectado (Ajustes → Spotify)',
  429: 'Spotify pidió esperar',
  502: 'Spotify no responde',
};

async function poll(): Promise<number> {
  const response = await fetch(
    `/overlay-data/spotify/now-playing?key=${encodeURIComponent(params.key)}`,
    { cache: 'no-store' },
  );
  if (!response.ok) {
    showDebug(STATUS_TEXT[response.status] ?? `Spotify: HTTP ${response.status}`);
    if (response.status === 409 || response.status === 401) {
      reading = undefined;
      render();
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(MAX_BACKOFF_MS, retryAfter * 1000)
      : pollMs * 2;
  }
  const parsed = SpotifyNowPlayingSchema.safeParse(await response.json());
  if (!parsed.success) {
    showDebug('Spotify: respuesta inesperada');
    return pollMs * 2;
  }
  reading = parsed.data;
  receivedAt = Date.now();
  showDebug(
    reading.track
      ? `Spotify: ${reading.isPlaying ? 'sonando' : 'en pausa'}`
      : 'Spotify: nada sonando',
  );
  render();
  return pollMs;
}

async function loop(): Promise<void> {
  let delay: number;
  try {
    delay = await poll();
  } catch (error) {
    showDebug('Spotify: sin conexión con el servidor');
    console.warn('[tiklive] spotify poll failed', error);
    delay = Math.min(MAX_BACKOFF_MS, pollMs * 2);
  }
  window.setTimeout(() => void loop(), delay);
}

window.setInterval(tick, TICK_MS);
void loop();
