import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AudioActionRunner,
  BrowserSpeech,
  ScreenSocket,
  WebAudioPlayer,
  describeError,
} from '@tiklive/overlays/embed';
import { OverlayKeyStore } from './overlay-key.store';

const ENABLED_KEY = 'tiklive.liveAudio.enabled';
const VOLUME_KEY = 'tiklive.liveAudio.volume';
const LOG_LIMIT = 20;
const GESTURES = ['pointerdown', 'keydown'] as const;
/** Attribute on the buttons that turn the audio on/off: the generic «first click» unlock skips them. */
export const CONTROL_ATTR = 'data-live-audio-control';

/**
 * off: turned off by the user · waiting: on, but the browser needs a click first ·
 * connecting: audio unlocked, socket (re)connecting · on: playing actions · error: could not start.
 */
export type LiveAudioState = 'off' | 'waiting' | 'connecting' | 'on' | 'error';

export interface LiveAudioEntry {
  readonly id: number;
  readonly at: number;
  readonly text: string;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the preference lasts for this visit
  }
}

/**
 * Plays the LIVE's sounds and voice inside the panel itself, so no separate audio tab is needed.
 * It is one more «audio» screen for the server (same queue, same acknowledgements as
 * /screen/audio/), and lives in the app shell so navigating between pages never cuts it.
 */
@Injectable({ providedIn: 'root' })
export class LiveAudioService {
  private readonly keys = inject(OverlayKeyStore);

  /** The user's choice, remembered across visits. On by default. */
  readonly enabled = signal(read(ENABLED_KEY) !== '0');
  readonly volume = signal(Math.min(1, Math.max(0, Number(read(VOLUME_KEY) ?? 1) || 0)));
  readonly state = signal<LiveAudioState>('off');
  readonly error = signal<string | undefined>(undefined);
  readonly entries = signal<readonly LiveAudioEntry[]>([]);
  readonly active = computed(() => this.state() === 'on');

  private player: WebAudioPlayer | undefined;
  private speech: BrowserSpeech | undefined;
  private socket: ScreenSocket | undefined;
  private starting: Promise<void> | undefined;
  private nextEntry = 0;
  private readonly onGesture = (event: Event) => {
    // The audio buttons handle their own click; starting here too would make them toggle off.
    if (event.target instanceof Element && event.target.closest(`[${CONTROL_ATTR}]`)) return;
    this.removeGestureListeners();
    if (this.enabled()) void this.start(false);
  };

  /** Called when the signed-in shell opens: resumes the audio if the user left it on. */
  restore(): void {
    if (!this.enabled()) {
      this.state.set('off');
      return;
    }
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (activation?.hasBeenActive) void this.start(false);
    else this.waitForGesture();
  }

  /** From a click: that gesture is what lets the browser play sound. */
  enable(): Promise<void> {
    this.enabled.set(true);
    write(ENABLED_KEY, '1');
    return this.start(true);
  }

  disable(): void {
    this.enabled.set(false);
    write(ENABLED_KEY, '0');
    this.shutdown();
    this.state.set('off');
  }

  toggle(): void {
    if (this.enabled() && this.state() !== 'waiting' && this.state() !== 'error') this.disable();
    else void this.enable();
  }

  setVolume(volume: number): void {
    const value = Math.min(1, Math.max(0, volume));
    this.volume.set(value);
    this.player?.setMaster(value);
    write(VOLUME_KEY, String(value));
  }

  /** On logout: stop without forgetting the user's preference. */
  stop(): void {
    this.shutdown();
    this.state.set(this.enabled() ? 'waiting' : 'off');
  }

  private start(testTone: boolean): Promise<void> {
    this.starting ??= this.doStart(testTone).finally(() => (this.starting = undefined));
    return this.starting;
  }

  private async doStart(testTone: boolean): Promise<void> {
    this.error.set(undefined);
    if (!(await this.unlock(testTone)) || !this.enabled()) return;
    if (this.socket) {
      if (this.state() !== 'on') this.state.set('connecting');
      return;
    }
    this.state.set('connecting');
    const key = await this.keys.load();
    if (!key) {
      this.fail('No se pudo leer la clave de overlays. Revisa la sesión del panel.');
      return;
    }
    if (!this.enabled() || this.socket) return; // turned off, or started elsewhere meanwhile
    this.connect();
  }

  /** False when the browser still blocks audio (then it waits for the next click). */
  private async unlock(testTone: boolean): Promise<boolean> {
    try {
      this.player ??= new WebAudioPlayer(this.volume());
      this.speech ??= new BrowserSpeech(() => this.volume());
      await this.player.unlock(testTone);
    } catch (error) {
      this.fail(`No se pudo iniciar el audio: ${describeError(error)}`);
      return false;
    }
    if (this.player.running) return true;
    if (this.enabled()) this.waitForGesture();
    return false;
  }

  private connect(): void {
    const player = this.player;
    const speech = this.speech;
    if (!player || !speech) return;
    const socket: ScreenSocket = new ScreenSocket({
      screenId: 'audio',
      key: () => this.keys.key(),
      onState: (state) => {
        if (this.socket !== socket) return;
        if (state === 'open') this.state.set('on');
        else {
          this.state.set('connecting');
          // A rotated overlay key makes the server refuse us: refresh it before the retry.
          if (state === 'closed') void this.keys.load();
        }
      },
      onMessage: (message) => void runner.handle(message),
    });
    const runner = new AudioActionRunner(
      player,
      speech,
      {
        done: (actionId, durationMs) => socket.send('action.done', { actionId, durationMs }),
        failed: (actionId, reason) => socket.send('action.failed', { actionId, reason }),
      },
      (text) => this.log(text),
    );
    this.socket = socket;
    socket.connect();
  }

  private shutdown(): void {
    this.removeGestureListeners();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.speech?.cancel();
    void this.player?.suspend().catch(() => undefined);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.state.set('error');
  }

  private waitForGesture(): void {
    this.state.set('waiting');
    for (const type of GESTURES) addEventListener(type, this.onGesture, { capture: true });
  }

  private removeGestureListeners(): void {
    for (const type of GESTURES) removeEventListener(type, this.onGesture, { capture: true });
  }

  private log(text: string): void {
    const entry = { id: this.nextEntry++, at: Date.now(), text };
    this.entries.update((list) => [entry, ...list].slice(0, LOG_LIMIT));
  }
}
