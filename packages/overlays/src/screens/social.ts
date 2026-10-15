import { el } from '../core/dom.js';
import { parseProfiles } from '../core/list-params.js';
import { readNumber } from '../core/params.js';
import { applyTheme } from '../core/theme.js';

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  youtube: 'YouTube',
  kick: 'Kick',
  instagram: 'Instagram',
  twitch: 'Twitch',
  x: 'X',
  twitter: 'X',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  discord: 'Discord',
};

const profiles = parseProfiles(new URLSearchParams(location.search).get('profiles'));
const intervalMs = readNumber('interval', 8, 2, 120) * 1000;
const stage = document.querySelector<HTMLElement>('#stage');

applyTheme();

const platform = el('span', 'social__platform');
const handle = el('span', 'social__handle');
const card = el('section', 'panel social');
card.append(platform, handle);
stage?.append(card);

/** Only configured profiles are shown; every value goes through textContent (never HTML). */
function render(index: number): void {
  const profile = profiles[index];
  if (!profile) return;
  platform.textContent = PLATFORM_LABELS[profile.platform.toLowerCase()] ?? profile.platform;
  handle.textContent = profile.handle;
  card.classList.remove('social--in');
  void card.offsetWidth;
  card.classList.add('social--in');
}

if (profiles.length > 0) {
  let index = 0;
  render(index);
  if (profiles.length > 1) {
    window.setInterval(() => {
      index = (index + 1) % profiles.length;
      render(index);
    }, intervalMs);
  }
} else {
  card.hidden = true;
}
