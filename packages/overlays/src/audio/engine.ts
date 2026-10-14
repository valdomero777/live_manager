import type { ScreenServerMessage } from '@tiklive/contracts';

type PlaySound = Extract<ScreenServerMessage, { type: 'action.play_sound' }>['payload'];
type Speak = Extract<ScreenServerMessage, { type: 'action.speak' }>['payload'];

const TEST_TONE_HZ = 880;
const TEST_TONE_S = 0.15;

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Web Audio player: one master GainNode plus one GainNode per sound; buffers cached by URL. */
export class WebAudioPlayer {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly cache = new Map<string, Promise<AudioBuffer>>();
  private readonly remote = new Set<HTMLAudioElement>();
  private masterVolume: number;

  constructor(masterVolume: number) {
    this.masterVolume = masterVolume;
    this.master.gain.value = masterVolume;
    this.master.connect(this.ctx.destination);
  }

  /** False until the browser lets this page play audio (a user gesture is required first). */
  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** Must run inside a user gesture. The short tone confirms that audio works. */
  async unlock(testTone = true): Promise<void> {
    await this.ctx.resume();
    if (!testTone) return;
    const osc = this.ctx.createOscillator();
    osc.frequency.value = TEST_TONE_HZ;
    osc.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + TEST_TONE_S);
  }

  /** Silences everything at once (buffered and streamed sounds) until the next unlock(). */
  async suspend(): Promise<void> {
    this.remote.forEach((audio) => audio.pause());
    await this.ctx.suspend();
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
      this.remote.add(audio);
      audio.volume = Math.min(1, Math.max(0, volume * this.masterVolume));
      const started = performance.now();
      const cap = maxMs === undefined ? undefined : setTimeout(() => finish(), maxMs);
      const done = () => {
        clearTimeout(cap);
        this.remote.delete(audio);
      };
      const finish = () => {
        done();
        audio.pause();
        resolve(performance.now() - started);
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('pause', finish, { once: true });
      audio.addEventListener(
        'error',
        () => {
          done();
          reject(new Error('No se pudo reproducir este sonido.'));
        },
        { once: true },
      );
      audio.play().catch((error: unknown) => {
        done();
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
export class BrowserSpeech {
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

  cancel(): void {
    speechSynthesis.cancel();
  }

  /** Accepts a voice name or a language tag such as "es-MX". */
  private pickVoice(wanted: string | undefined): SpeechSynthesisVoice | undefined {
    if (!wanted) return this.voices.find((v) => v.lang.startsWith('es'));
    return this.voices.find((v) => v.name === wanted) ?? this.voices.find((v) => v.lang === wanted);
  }
}

export interface AudioActionAck {
  done(actionId: string, durationMs: number): void;
  failed(actionId: string, reason: string): void;
}

/** Executes audio actions one at a time and acknowledges each to the server. */
export class AudioActionRunner {
  constructor(
    private readonly player: WebAudioPlayer,
    private readonly speech: BrowserSpeech,
    private readonly ack: AudioActionAck,
    private readonly log: (text: string) => void,
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
      this.ack.done(actionId, durationMs);
      this.log(label);
    } catch (error) {
      this.ack.failed(actionId, describeError(error));
      this.log(`Error: ${label} (${describeError(error)})`);
    }
  }
}
