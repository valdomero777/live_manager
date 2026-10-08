import { readChoice, readNumber } from './params.js';

export const THEMES = ['card', 'clear', 'light'] as const;
const FONT = /^[\w\s-]{1,40}$/;

/** Applies ?theme=, ?scale= and ?font= (system fonts only: no network fetches on the stream PC). */
export function applyTheme(): void {
  const root = document.documentElement;
  root.dataset['theme'] = readChoice('theme', THEMES, 'card');
  root.style.setProperty('--scale', String(readNumber('scale', 1, 0.25, 4)));
  const font = new URLSearchParams(location.search).get('font');
  if (font && FONT.test(font)) root.style.setProperty('--font', `'${font}', system-ui, sans-serif`);
}
