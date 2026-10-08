import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService, PLAYBACK_ERROR } from './audio.service';

/** Minimal HTMLAudioElement stand-in: records src/volume and lets a test choose play()'s result. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static playResult: () => Promise<void> = () => Promise.resolve();
  src = '';
  volume = 1;
  currentTime = 0;
  preload = '';
  paused = true;
  private readonly listeners = new Map<string, () => void>();

  constructor() {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, fn);
  }
  getAttribute(): string {
    return this.src;
  }
  play(): Promise<void> {
    this.paused = false;
    return FakeAudio.playResult();
  }
  pause(): void {
    this.paused = true;
  }
  emit(type: string): void {
    this.listeners.get(type)?.();
  }
}

describe('AudioService', () => {
  const url = 'https://www.myinstants.com/media/sounds/vine-boom.mp3';

  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.playResult = () => Promise.resolve();
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('addEventListener', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('streams the remote URL on one shared element at the requested volume', async () => {
    const service = new AudioService();
    await service.playSound(url, 0.4);
    await service.playSound(`${url}?2`, 0.9);
    expect(FakeAudio.instances).toHaveLength(1);
    const audio = FakeAudio.instances[0] as FakeAudio;
    expect(audio.src).toBe(`${url}?2`);
    expect(audio.volume).toBe(0.9);
    expect(service.playingUrl()).toBe(`${url}?2`);
    expect(service.audioUnlocked()).toBe(true);
  });

  it('clamps volume, and stop/pause clear the playing state', async () => {
    const service = new AudioService();
    service.setVolume(3);
    expect((FakeAudio.instances[0] as FakeAudio).volume).toBe(1);
    service.setVolume(-1);
    expect((FakeAudio.instances[0] as FakeAudio).volume).toBe(0);
    await service.playSound(url, 0.5);
    service.stopSound();
    expect(service.playingUrl()).toBeUndefined();
    expect((FakeAudio.instances[0] as FakeAudio).paused).toBe(true);
  });

  it('asks the user to enable audio when the browser blocks autoplay', async () => {
    FakeAudio.playResult = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    const service = new AudioService();
    await service.playSound(url);
    expect(service.blocked()).toBe(true);
    expect(service.error()).toBeUndefined();
    service.unlock();
    expect(service.blocked()).toBe(false);
    expect(service.audioUnlocked()).toBe(true);
  });

  it('shows a friendly message when the sound cannot be played', async () => {
    FakeAudio.playResult = () => Promise.reject(new DOMException('gone', 'NotSupportedError'));
    const service = new AudioService();
    await service.playSound(url);
    expect(service.error()).toBe(PLAYBACK_ERROR);
    expect(service.playingUrl()).toBeUndefined();
  });

  it('reports a load error from the element without throwing', async () => {
    const service = new AudioService();
    await service.playSound(url);
    (FakeAudio.instances[0] as FakeAudio).emit('error');
    expect(service.error()).toBe(PLAYBACK_ERROR);
  });
});
