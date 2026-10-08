import type { ScreenServerMessage } from '@tiklive/contracts';
import { readCommonParams, readNumber } from '../core/params.js';
import { ScreenSocket } from '../core/ws-client.js';

type PlaySound = Extract<ScreenServerMessage, { type: 'action.play_sound' }>['payload'];
type Speak = Extract<ScreenServerMessage, { type: 'action.speak' }>['payload'];

const LOG_LIMIT = 20;
const TEST_TONE_HZ = 880;
const TEST_TONE_S = 0.15;

const startButton = document.querySelector<HTMLButtonElement>('#start');
const masterInput = document.querySelector<HTMLInputElement>('#master');
const statusEl = document.querySelector<HTMLElement>('#status');
const logEl = document.querySelector<HTMLOListElement>('#log');

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Web Audio player: one master GainNode plus one GainNode per sound; buffers cached by URL. */
class WebAudioPlayer {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly cache = new Map<string, Promise<AudioBuffer>>();
  private masterVolume: number;

  constructor(masterVolume: number) {
    this.masterVolume = masterVolume;
    this.master.gain.value = masterVolume;
    this.master.connect(this.ctx.destination);
  }

  async unlock(): Promise<void> {
    await this.ctx.resume();
    const osc = this.ctx.createOscillator();
    osc.frequency.value = TEST_TONE_HZ;
    osc.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + TEST_TONE_S);
  }

  setMaster(volume: number): void {
    this.masterVolume = volume;
    this.master.gain.value = volume;
  }

  preload(urls: readonly string[]): void {
    urls
      .filter((url) => !isRemoteUrl(url))
      .forEach((url) => void this.load(url).catch(() => this.cache.delete(url)));
  }

  async play(url: string, volume: number, maxMs?: number): Promise<number> {
    if (isRemoteUrl(url)) return this.playRemote(url, volume, maxMs);
    const buffer = await this.load(url);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.master);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const started = performance.now();
    const ended = new Promise<void>((resolve) => source.addEventListener('ended', () => resolve()));
    source.start();
    if (maxMs !== undefined) source.stop(this.ctx.currentTime + maxMs / 1000);
    await ended;
    gain.disconnect();
    return performance.now() - started;
  }

  /**
   * Third-party sounds (MyInstants) stream straight from their URL with an Audio element: no
   * download on our side and no CORS requirement, unlike fetch + decodeAudioData.
   */
  private playRemote(url: string, volume: number, maxMs?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.volume = Math.min(1, Math.max(0, volume * this.masterVolume));
      const started = performance.now();
      const cap = maxMs === undefined ? undefined : setTimeout(() => finish(), maxMs);
      const finish = () => {
        clearTimeout(cap);
        audio.pause();
        resolve(performance.now() - started);
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener(
        'error',
        () => {
          clearTimeout(cap);
          reject(new Error('No se pudo reproducir este sonido.'));
        },
        { once: true },
      );
      audio.play().catch((error: unknown) => {
        clearTimeout(cap);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private load(url: string): Promise<AudioBuffer> {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data));
      this.cache.set(url, pending);
    }
    return pending;
  }
}

/** Web Speech API; voices load asynchronously (voiceschanged). */
class BrowserSpeech {
  private voices: SpeechSynthesisVoice[] = [];

  constructor(private readonly masterVolume: () => number) {
    const refresh = () => (this.voices = speechSynthesis.getVoices());
    refresh();
    speechSynthesis.addEventListener('voiceschanged', refresh);
  }

  speak(p: Speak): Promise<number> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(p.text);
      const voice = this.pickVoice(p.voice);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? p.voice ?? 'es-MX';
      utterance.volume = p.volume * this.masterVolume();
      if (p.rate !== undefined) utterance.rate = p.rate;
      if (p.pitch !== undefined) utterance.pitch = p.pitch;
      const started = performance.now();
      utterance.addEventListener('end', () => resolve(performance.now() - started));
      utterance.addEventListener('error', (e) => reject(new Error(e.error)));
      speechSynthesis.speak(utterance);
    });
  }

  /** Accepts a voice name or a language tag such as "es-MX". */
  private pickVoice(wanted: string | undefined): SpeechSynthesisVoice | undefined {
    if (!wanted) return this.voices.find((v) => v.lang.startsWith('es'));
    return this.voices.find((v) => v.name === wanted) ?? this.voices.find((v) => v.lang === wanted);
  }
}

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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Executes audio actions one at a time and acknowledges each to the server. */
class AudioActionRunner {
  constructor(
    private readonly player: WebAudioPlayer,
    private readonly speech: BrowserSpeech,
    private readonly socket: () => ScreenSocket,
  ) {}

  async handle(message: ScreenServerMessage): Promise<void> {
    switch (message.type) {
      case 'config.changed':
        this.player.preload(message.payload.preloadUrls);
        break;
      case 'action.play_sound': {
        const p: PlaySound = message.payload;
        await this.run(p.actionId, `Sonido ${p.url}`, () =>
          this.player.play(p.url, p.volume, p.maxMs),
        );
        break;
      }
      case 'action.speak': {
        const p = message.payload;
        await this.run(p.actionId, `Voz: ${p.text}`, () => this.speech.speak(p));
        break;
      }
      default:
        break;
    }
  }

  private async run(actionId: string, label: string, task: () => Promise<number>): Promise<void> {
    try {
      const durationMs = await task();
      this.socket().send('action.done', { actionId, durationMs });
      log(label);
    } catch (error) {
      this.socket().send('action.failed', { actionId, reason: describe(error) });
      log(`Error: ${label} (${describe(error)})`);
    }
  }
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
  const runner = new AudioActionRunner(player, speech, () => socket);

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
    setStatus(`No se pudo iniciar el audio: ${describe(error)}`);
    startButton.disabled = false;
  });
});
