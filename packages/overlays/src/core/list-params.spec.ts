import { describe, expect, it } from 'vitest';
import { parseList, parseProfiles } from './list-params.js';

describe('parseList', () => {
  it('splits on "|", trims and drops empty items', () => {
    expect(parseList(' hola | |mundo ')).toEqual(['hola', 'mundo']);
  });

  it('returns an empty list when the parameter is missing', () => {
    expect(parseList(null)).toEqual([]);
  });

  it('caps the number and length of items', () => {
    const many = Array.from({ length: 30 }, (_, i) => `m${i}`).join('|');
    expect(parseList(many)).toHaveLength(20);
    expect(parseList('x'.repeat(500))[0]).toHaveLength(200);
  });
});

describe('parseProfiles', () => {
  it('reads platform:handle pairs and keeps colons inside the handle', () => {
    expect(parseProfiles('youtube:@canal|kick:a:b')).toEqual([
      { platform: 'youtube', handle: '@canal' },
      { platform: 'kick', handle: 'a:b' },
    ]);
  });

  it('ignores entries without a platform or a handle', () => {
    expect(parseProfiles('solo|:x|kick:|ok:1')).toEqual([{ platform: 'ok', handle: '1' }]);
  });
});
