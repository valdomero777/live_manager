import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { SecretGenerator } from '../../application/ports/config-store.js';
import type { Cancel, IdGenerator, Scheduler } from '../../application/ports/scheduler.js';
import type { Clock, Random } from '../../domain/shared/time.js';

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

const RANDOM_RESOLUTION = 2 ** 32;

export class CryptoRandom implements Random {
  next(): number {
    return randomInt(RANDOM_RESOLUTION) / RANDOM_RESOLUTION;
  }
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

export class NodeScheduler implements Scheduler {
  setTimeout(fn: () => void, ms: number): Cancel {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  }

  setInterval(fn: () => void, ms: number): Cancel {
    const handle = setInterval(fn, ms);
    handle.unref();
    return () => clearInterval(handle);
  }
}

/** Unambiguous alphabet for codes typed by hand (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const TOKEN_BYTES = 32;

export class CryptoSecrets implements SecretGenerator {
  token(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  code(): string {
    return Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
  }
}
