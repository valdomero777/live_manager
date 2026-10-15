import type { TtsVoiceInfo } from '@tiklive/contracts';

/** Raised when the voice service cannot answer; details stay in the server log. */
export class SpeechSynthesisError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SpeechSynthesisError';
  }
}

export interface SynthesisRequest {
  readonly text: string;
  /** A voice name from listVoices(). */
  readonly voice: string;
  /** 1 = normal speed. */
  readonly rate?: number;
  /** 1 = normal pitch. */
  readonly pitch?: number;
}

/** A server-side voice engine (Microsoft Edge neural voices today). Returns MP3 audio. */
export interface SpeechSynthesizer {
  listVoices(): Promise<TtsVoiceInfo[]>;
  synthesize(request: SynthesisRequest): Promise<Uint8Array>;
}
