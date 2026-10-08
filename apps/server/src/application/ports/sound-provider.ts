import type { SoundSearchResult } from '@tiklive/contracts';

/** Raised when the external catalogue cannot answer; details stay in the server log. */
export class SoundSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SoundSourceError';
  }
}

/** A catalogue of sounds (MyInstants today). Implementations return provider-neutral sounds. */
export interface SoundProvider {
  search(query: string, page: number): Promise<SoundSearchResult>;
}
