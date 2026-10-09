import { describe, expect, it } from 'vitest';
import { FakeClock } from '../shared/time.js';
import { resolveJsonTemplate } from '../rules/template.js';
import { BREAKER_FAILURE_LIMIT, BREAKER_OPEN_MS, CircuitBreaker } from './circuit-breaker.js';
import { isNonPublicAddress, parseHostList } from './network-guard.js';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.50',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public %s',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    },
  );
});

describe('parseHostList', () => {
  it('trims, lowercases and drops empties', () => {
    expect([...parseHostList(' A.com, ,b.COM ')]).toEqual(['a.com', 'b.com']);
    expect(parseHostList(undefined).size).toBe(0);
  });
});

describe('resolveJsonTemplate', () => {
  it('escapes viewer text so it cannot break out of the string', () => {
    const body = resolveJsonTemplate('{"text":"{comment}","n":1}', { comment: 'a"b\nc\\' });
    expect(JSON.parse(body ?? '')).toEqual({ text: 'a"b\nc\\', n: 1 });
  });

  it('keeps unknown placeholders and rejects text that is not JSON', () => {
    expect(resolveJsonTemplate('{"x":"{nope}"}', {})).toBe('{"x":"{nope}"}');
    expect(resolveJsonTemplate('hola {nickname}', { nickname: 'a' })).toBeUndefined();
  });
});

describe('CircuitBreaker', () => {
  it('opens after 5 failures in a row, lets one call through after a minute, closes on success', () => {
    const clock = new FakeClock(0);
    const breaker = new CircuitBreaker(clock);
    for (let i = 0; i < BREAKER_FAILURE_LIMIT - 1; i++) breaker.recordFailure('h');
    expect(breaker.canCall('h')).toBe(true);

    breaker.recordFailure('h');
    expect(breaker.canCall('h')).toBe(false);
    expect(breaker.canCall('other')).toBe(true);

    clock.advance(BREAKER_OPEN_MS);
    expect(breaker.canCall('h')).toBe(true);
    breaker.recordSuccess('h');
    breaker.recordFailure('h');
    expect(breaker.canCall('h')).toBe(true);
  });
});
