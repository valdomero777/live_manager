import type { ScreenServerMessage } from '@tiklive/contracts';
import { readChoice, readCommonParams, readNumber } from '../core/params.js';
import { ScreenSocket } from '../core/ws-client.js';

type ShowAlert = Extract<ScreenServerMessage, { type: 'action.show_alert' }>['payload'];

const POSITIONS = ['top', 'center', 'bottom'] as const;
/** Must match the exit animation duration in alerts.css. */
const EXIT_MS = 400;

const stage = document.querySelector<HTMLElement>('#stage');
const debugEl = document.querySelector<HTMLElement>('#debug');
const params = readCommonParams();

document.documentElement.style.setProperty('--scale', String(readNumber('scale', 1, 0.25, 4)));
stage?.setAttribute('data-position', readChoice('position', POSITIONS, 'center'));

function showDebug(text: string): void {
  if (!params.debug || !debugEl) return;
  debugEl.hidden = false;
  debugEl.textContent = text;
}

/** Builds the alert with textContent only: viewer nicknames are never parsed as HTML. */
function renderAlert(p: ShowAlert): HTMLElement {
  const card = document.createElement('div');
  card.className = 'alert alert--enter';
  if (p.imageUrl) {
    const img = document.createElement('img');
    img.src = p.imageUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    card.append(img);
  }
  const text = document.createElement('p');
  text.className = 'alert__text';
  text.textContent = p.text;
  card.append(text);
  return card;
}

/** Visible time is server-defined (durationMs); the server only queues one alert at a time. */
function showAlert(p: ShowAlert): Promise<number> {
  return new Promise((resolve) => {
    if (!stage) return resolve(0);
    const card = renderAlert(p);
    stage.replaceChildren(card);
    const started = performance.now();
    window.setTimeout(
      () => {
        card.classList.replace('alert--enter', 'alert--exit');
        window.setTimeout(() => {
          card.remove();
          resolve(performance.now() - started);
        }, EXIT_MS);
      },
      Math.max(0, p.durationMs - EXIT_MS),
    );
  });
}

const socket: ScreenSocket = new ScreenSocket({
  screenId: 'alerts',
  key: params.key,
  onState: (state) => showDebug(`ws: ${state}`),
  onMessage: (message) => {
    if (message.type !== 'action.show_alert') return;
    const { actionId } = message.payload;
    showAlert(message.payload).then(
      (durationMs) => socket.send('action.done', { actionId, durationMs }),
      (error: unknown) => socket.send('action.failed', { actionId, reason: String(error) }),
    );
  },
});

params.warnings.forEach(showDebug);
socket.connect();
