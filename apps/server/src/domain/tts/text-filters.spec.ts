import { describe, expect, it } from 'vitest';
import { FakeClock } from '../shared/time.js';
import {
  DEFAULT_MODERATION,
  DuplicateTextFilter,
  PerUserRateFilter,
  blocklistFilter,
  buildModerationChain,
  emojiFilter,
  lengthFilter,
  linksFilter,
  normalizeFilter,
  pronunciationFilter,
} from './text-filters.js';

const ctx = { viewerId: 'u1' };

describe('text filters', () => {
  it('normalize collapses repeated letters and whitespace', () => {
    expect(normalizeFilter.apply('  holaaaaa    mundo ', ctx)).toBe('holaa mundo');
    expect(normalizeFilter.apply('   ', ctx)).toBeNull();
  });

  it('links removes urls and emails, and mentions unless allowed', () => {
    expect(linksFilter(false).apply('mira https://x.com/a y a@b.com @pepe', ctx)).toBe('mira y');
    expect(linksFilter(true).apply('hola @pepe', ctx)).toBe('hola @pepe');
    expect(linksFilter(false).apply('www.spam.com', ctx)).toBeNull();
  });

  it('emoji strips pictographs when enabled', () => {
    expect(emojiFilter(true).apply('hola 🔥🔥 crack 👨‍👩‍👧', ctx)).toBe('hola crack');
    expect(emojiFilter(false).apply('hola 🔥', ctx)).toBe('hola 🔥');
  });

  it('blocklist drops or masks whole words, case-insensitively', () => {
    expect(blocklistFilter(['feo'], 'drop').apply('eres FEO', ctx)).toBeNull();
    expect(blocklistFilter(['feo'], 'drop').apply('eres feote', ctx)).toBe('eres feote');
    expect(blocklistFilter(['feo'], 'mask').apply('feo y feo', ctx)).toBe('*** y ***');
  });

  it('blocklist drop mode is stable across repeated calls', () => {
    const filter = blocklistFilter(['malo'], 'drop');
    expect([1, 2, 3].map(() => filter.apply('malo', ctx))).toEqual([null, null, null]);
  });

  it('given a 300-char comment, when limited to 150, then it is truncated (RF-10)', () => {
    expect(lengthFilter(150).apply('a'.repeat(300), ctx)).toHaveLength(150);
  });

  it('per-user rate allows N per rolling minute', () => {
    const clock = new FakeClock(0);
    const filter = new PerUserRateFilter(clock, 2);
    expect(filter.apply('1', ctx)).toBe('1');
    expect(filter.apply('2', ctx)).toBe('2');
    expect(filter.apply('3', ctx)).toBeNull();
    expect(filter.apply('x', { viewerId: 'u2' })).toBe('x');
    clock.advance(60_000);
    expect(filter.apply('4', ctx)).toBe('4');
  });

  it('duplicates drops the same text within the window', () => {
    const clock = new FakeClock(0);
    const filter = new DuplicateTextFilter(clock, 30_000);
    expect(filter.apply('Hola')).toBe('Hola');
    expect(filter.apply('hola')).toBeNull();
    clock.advance(30_000);
    expect(filter.apply('hola')).toBe('hola');
  });

  it('pronunciation replaces whole words', () => {
    expect(pronunciationFilter({ GG: 'buena partida' }).apply('gg wp', ctx)).toBe(
      'buena partida wp',
    );
  });
});

describe('moderation chain (RF-11)', () => {
  it('a blocked comment never comes out of the chain', () => {
    const chain = buildModerationChain(
      { ...DEFAULT_MODERATION, blockedTerms: ['tonto'] },
      new FakeClock(0),
    );
    expect(chain.apply('eres un TONTO', ctx)).toBeNull();
  });

  it('cleans a typical comment end to end', () => {
    const chain = buildModerationChain(DEFAULT_MODERATION, new FakeClock(0));
    expect(chain.apply('holaaaaa 🔥 visita https://spam.io', ctx)).toBe('holaa visita');
  });
});
