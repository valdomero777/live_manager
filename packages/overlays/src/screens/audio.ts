import { readCommonParams, readNumber } from '../core/params.js';
import { ScreenSocket } from '../core/ws-client.js';
import {
  AudioActionRunner,
  BrowserSpeech,
  WebAudioPlayer,
  describeError,
} from '../audio/engine.js';

const LOG_LIMIT = 20;

const startButton = document.querySelector<HTMLButtonElement>('#start');
const masterInput = document.querySelector<HTMLInputElement>('#master');
const statusEl = document.querySelector<HTMLElement>('#status');
const logEl = document.querySelector<HTMLOListElement>('#log');

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function log(text: string): void {
  if (!logEl) return;
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} · ${text}`;
  logEl.prepend(item);
  while (logEl.children.length > LOG_LIMIT) logEl.lastElementChild?.remove();
}

/** Runs after the user's click: browsers only allow audio after a gesture. */
async function start(): Promise<void> {
  const params = readCommonParams();
  params.warnings.forEach((w) => log(w));
  const masterVolume = readNumber('master', 1, 0, 1);
  if (masterInput) masterInput.value = String(masterVolume);

  const player = new WebAudioPlayer(masterVolume);
  await player.unlock();
  masterInput?.addEventListener('input', () => player.setMaster(Number(masterInput.value)));
  const speech = new BrowserSpeech(() => Number(masterInput?.value ?? 1));
  const runner = new AudioActionRunner(
    player,
    speech,
    {
      done: (actionId, durationMs) => socket.send('action.done', { actionId, durationMs }),
      failed: (actionId, reason) => socket.send('action.failed', { actionId, reason }),
    },
    log,
  );

  // Connecting only after unlock means the server holds actions until audio can play.
  const socket = new ScreenSocket({
    screenId: 'audio',
    key: params.key,
    onState: (state) =>
      setStatus(state === 'open' ? 'Audio activo · conectado' : `Audio activo · ${state}`),
    onMessage: (message) => void runner.handle(message),
  });
  socket.connect();
}

startButton?.addEventListener('click', () => {
  startButton.disabled = true;
  start().catch((error: unknown) => {
    setStatus(`No se pudo iniciar el audio: ${describeError(error)}`);
    startButton.disabled = false;
  });
});
