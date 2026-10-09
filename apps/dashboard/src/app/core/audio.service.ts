import { Injectable, signal } from '@angular/core';

export const PLAYBACK_ERROR = 'No se pudo reproducir este sonido.';

/**
 * The dashboard's single audio player (previews and trigger tests). One shared HTMLAudioElement
 * streams the remote URL directly; nothing is downloaded or cached by the app.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly audio = new Audio();
  private volume = 0.8;

  /** URL currently playing, so lists can show Play/Stop on the right row. */
  readonly playingUrl = signal<string | undefined>(undefined);
  /** URL paused mid-way, so the player can offer «Reanudar» instead of starting over. */
  readonly pausedUrl = signal<string | undefined>(undefined);
  /** URL whose playback was requested but has not started yet (buffering). */
  readonly loadingUrl = signal<string | undefined>(undefined);
  /** True once the user interacted with the page, which browsers require before autoplay. */
  readonly audioUnlocked = signal(false);
  /** The browser refused to start playback until the user enables audio. */
  readonly blocked = signal(false);
  readonly error = signal<string | undefined>(undefined);

  constructor() {
    this.audio.preload = 'none';
    this.audio.addEventListener('ended', () => this.playingUrl.set(undefined));
    this.audio.addEventListener('playing', () => this.loadingUrl.set(undefined));
    this.audio.addEventListener('error', () => {
      if (!this.audio.getAttribute('src')) return;
      this.playingUrl.set(undefined);
      this.loadingUrl.set(undefined);
      this.error.set(PLAYBACK_ERROR);
    });
    const unlock = () => this.audioUnlocked.set(true);
    for (const type of ['pointerdown', 'keydown']) {
      addEventListener(type, unlock, { once: true, capture: true });
    }
  }

  async playSound(url: string, volume = this.volume): Promise<void> {
    this.error.set(undefined);
    this.blocked.set(false);
    this.setVolume(volume);
    this.audio.pause();
    this.audio.src = url;
    this.playingUrl.set(url);
    this.pausedUrl.set(undefined);
    this.loadingUrl.set(url);
    await this.start(url);
  }

  /** Continues a paused sound from where it stopped. */
  async resume(): Promise<void> {
    const url = this.pausedUrl();
    if (!url) return;
    this.pausedUrl.set(undefined);
    this.playingUrl.set(url);
    await this.start(url);
  }

  private async start(url: string): Promise<void> {
    try {
      await this.audio.play();
      this.audioUnlocked.set(true);
      if (this.loadingUrl() === url) this.loadingUrl.set(undefined);
    } catch (e) {
      if (this.audio.src !== url) return; // superseded by a newer playSound()
      this.playingUrl.set(undefined);
      this.loadingUrl.set(undefined);
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (e instanceof DOMException && e.name === 'NotAllowedError') this.blocked.set(true);
      else this.error.set(PLAYBACK_ERROR);
    }
  }

  pause(): void {
    const url = this.playingUrl();
    this.audio.pause();
    this.playingUrl.set(undefined);
    this.pausedUrl.set(url);
  }

  stopSound(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.playingUrl.set(undefined);
    this.pausedUrl.set(undefined);
    this.loadingUrl.set(undefined);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.audio.volume = this.volume;
  }

  /** Called from a click on «Activar audio»: that gesture lifts the autoplay block. */
  unlock(): void {
    this.audioUnlocked.set(true);
    this.blocked.set(false);
  }
}
