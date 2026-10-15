import type { SoundSearchResult } from '@tiklive/contracts';

/** unavailable: the catalogue failed to answer; not_configured: it needs a key nobody set. */
export type SoundSourceFailure = 'unavailable' | 'not_configured';

/** Raised when the external catalogue cannot answer; details stay in the server log. */
export class SoundSourceError extends Error {
  readonly reason: SoundSourceFailure;

  constructor(message: string, options?: { cause?: unknown; reason?: SoundSourceFailure }) {
    super(message, options);
    this.name = 'SoundSourceError';
    this.reason = options?.reason ?? 'unavailable';
  }
}

/** A catalogue of sounds (MyInstants, Freesound). Implementations return provider-neutral sounds. */
export interface SoundProvider {
  search(query: string, page: number): Promise<SoundSearchResult>;
}
