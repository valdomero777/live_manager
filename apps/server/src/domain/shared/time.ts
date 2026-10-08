/** Injectable time source; no domain code calls Date.now() directly. */
export interface Clock {
  now(): number;
}

/** Injectable randomness; returns a float in [0, 1). */
export interface Random {
  next(): number;
}

export class FakeClock implements Clock {
  constructor(private current = 0) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(ms: number): void {
    this.current = ms;
  }
}

/** Deterministic PRNG (mulberry32) for tests and seeded features. */
export class SeededRandom implements Random {
  constructor(private seed: number) {}

  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
