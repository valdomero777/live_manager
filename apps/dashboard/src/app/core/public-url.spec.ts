import { describe, expect, it } from 'vitest';
import { normalizePublicUrl } from './public-url';

describe('normalizePublicUrl', () => {
  it('adds https to a bare host and drops paths and trailing slashes', () => {
    expect(normalizePublicUrl('abc.trycloudflare.com')).toBe('https://abc.trycloudflare.com');
    expect(normalizePublicUrl(' https://abc.trycloudflare.com/panel/ ')).toBe(
      'https://abc.trycloudflare.com',
    );
  });

  it('keeps an explicit http address and its port', () => {
    expect(normalizePublicUrl('http://192.168.1.5:3000')).toBe('http://192.168.1.5:3000');
  });

  it('rejects empty, non-web and malformed values', () => {
    expect(normalizePublicUrl('')).toBeUndefined();
    expect(normalizePublicUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizePublicUrl('ftp://abc.com')).toBeUndefined();
    expect(normalizePublicUrl('no es una url')).toBeUndefined();
  });
});
