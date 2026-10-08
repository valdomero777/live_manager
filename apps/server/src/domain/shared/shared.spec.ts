import { describe, expect, it } from 'vitest';
import { computeBackoffDelay } from '../connector/backoff.js';
import { assertTransition, canTransition } from '../connector/connector-state.js';
import { InvalidStateTransitionError } from './errors.js';
import { LruSet } from './lru-set.js';
import { SeededRandom, type Random } from './time.js';

const fixed = (value: number): Random => ({ next: () => value });

describe('LruSet', () => {
  it('given a repeated key, when added, then reports it as not new', () => {
    const set = new LruSet(3);
    expect(set.add('a')).toBe(true);
    expect(set.add('a')).toBe(false);
  });

  it('given capacity is exceeded, when adding, then evicts the oldest key', () => {
    const set = new LruSet(2);
    set.add('a');
    set.add('b');
    set.add('c');
    expect(set.has('a')).toBe(false);
    expect(set.has('c')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('rejects a capacity below 1', () => {
    expect(() => new LruSet(0)).toThrow(RangeError);
  });
});

describe('computeBackoffDelay', () => {
  it('doubles from 1s and caps at 30s, plus jitter', () => {
    expect(computeBackoffDelay(0, fixed(0))).toBe(1_000);
    expect(computeBackoffDelay(3, fixed(0))).toBe(8_000);
    expect(computeBackoffDelay(10, fixed(0))).toBe(30_000);
    expect(computeBackoffDelay(0, fixed(0.5))).toBe(1_250);
  });

  it('never exceeds max + jitter for any attempt', () => {
    const random = new SeededRandom(42);
    for (let attempt = 0; attempt < 50; attempt++) {
      const delay = computeBackoffDelay(attempt, random);
      expect(delay).toBeGreaterThanOrEqual(1_000);
      expect(delay).toBeLessThan(30_500);
    }
  });
});

describe('connector state machine', () => {
  it('allows the documented transitions', () => {
    expect(canTransition('idle', 'connecting')).toBe(true);
    expect(canTransition('connecting', 'waiting_host')).toBe(true);
    expect(canTransition('reconnecting', 'connecting')).toBe(true);
    expect(canTransition('connected', 'stopped')).toBe(true);
  });

  it('rejects undocumented transitions', () => {
    expect(canTransition('idle', 'connected')).toBe(false);
    expect(() => assertTransition('waiting_host', 'connected')).toThrow(
      InvalidStateTransitionError,
    );
  });
});

describe('SeededRandom', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = new SeededRandom(7);
    const b = new SeededRandom(7);
    const values = Array.from({ length: 100 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
