import { el } from '../core/dom.js';
import { parseList } from '../core/list-params.js';
import { readNumber } from '../core/params.js';
import { applyTheme } from '../core/theme.js';

/** Static announcements: no WebSocket, so the ticker works even when the server is unreachable. */
const messages = parseList(new URLSearchParams(location.search).get('messages'));
const speed = readNumber('speed', 120, 20, 600); // px per second at scale 1
const pauseMs = readNumber('pause', 2, 0, 60) * 1000;
const stage = document.querySelector<HTMLElement>('#stage');

applyTheme();

const text = el('span', 'ticker__text');
const bar = el('div', 'ticker');
bar.append(text);
stage?.append(bar);

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One message at a time, so a new announcement never overwrites the one on screen. */
async function show(message: string): Promise<void> {
  text.style.transform = '';
  text.textContent = message;
  const width = bar.clientWidth;
  const textWidth = text.offsetWidth;
  if (reducedMotion || textWidth <= width) {
    text.style.transform = `translateX(${Math.max(0, (width - textWidth) / 2)}px)`;
    await wait(Math.max(4_000, pauseMs));
    return;
  }
  const scale =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const distance = width + textWidth;
  const animation = text.animate(
    [{ transform: `translateX(${width}px)` }, { transform: `translateX(${-textWidth}px)` }],
    { duration: (distance / (speed * scale)) * 1000, easing: 'linear', fill: 'forwards' },
  );
  await animation.finished.catch(() => undefined);
  await wait(pauseMs);
}

async function loop(): Promise<void> {
  for (let i = 0; ; i = (i + 1) % messages.length) {
    await show(messages[i] ?? '');
  }
}

/** Starts after load so the widths are measured with the stylesheet and fonts applied. */
if (messages.length > 0) {
  window.addEventListener('load', () => void document.fonts.ready.then(loop), { once: true });
}
