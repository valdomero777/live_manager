import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../domain/shared/time.js';
import { BREAKER_FAILURE_LIMIT } from '../../domain/webhook/circuit-breaker.js';
import { silentLogger } from '../ports/logger.js';
import { SpotifyError } from '../ports/spotify-client.js';
import type { WebhookRequest } from '../ports/webhook-client.js';
import { ServerActionRunner } from './server-action-runner.js';

const hook = (body = '{"u":"{nickname}"}') =>
  ({ type: 'webhook', url: 'https://hooks.example.com/a', method: 'POST', body }) as const;
const ctx = { vars: { nickname: 'Ana "la" mejor' }, eventId: 'e1', ruleId: 7 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

interface SetupOptions {
  allowed?: boolean;
  fail?: boolean;
  spotifyConnected?: boolean;
  spotifyFailure?: Error;
  noMatch?: boolean;
}

function setup(options: SetupOptions = {}) {
  const sent: WebhookRequest[] = [];
  const adjusted: [number, number][] = [];
  const spotifyCalls: string[] = [];
  const notices: string[] = [];
  const runner = new ServerActionRunner({
    goals: {
      adjust: async (id, amount) => {
        adjusted.push([id, amount]);
        return id === 1;
      },
    },
    webhook: {
      isAllowed: () => options.allowed ?? true,
      send: async (request) => {
        sent.push(request);
        if (options.fail) throw new Error('boom');
      },
    },
    spotify: {
      canControlPlayback: () => options.spotifyConnected ?? true,
      queueSong: async (query, policy) => {
        spotifyCalls.push(`queue:${query}:${policy.allowExplicit}:${policy.maxDurationMs}`);
        if (options.spotifyFailure) throw options.spotifyFailure;
        return options.noMatch ? undefined : { title: 'Song', artists: ['A'] };
      },
      skip: async () => {
        spotifyCalls.push('skip');
        if (options.spotifyFailure) throw options.spotifyFailure;
      },
    },
    notifier: {
      publish: (_type, payload) => notices.push((payload as { message: string }).message),
    },
    clock: new FakeClock(0),
    logger: silentLogger,
  });
  return { runner, sent, adjusted, spotifyCalls, notices };
}

describe('ServerActionRunner', () => {
  it('given updateGoal, then adds the amount to that goal', async () => {
    const { runner, adjusted } = setup();
    expect(runner.run({ type: 'updateGoal', goalId: 1, amount: -3 }, ctx)).toBe(true);
    await flush();
    expect(adjusted).toEqual([[1, -3]]);
  });

  it('given a webhook, then sends the escaped JSON body', async () => {
    const { runner, sent } = setup();
    expect(runner.run(hook(), ctx)).toBe(true);
    await flush();
    expect(JSON.parse(sent[0]?.body ?? '')).toEqual({ u: 'Ana "la" mejor' });
  });

  it('given a forbidden destination or an invalid body, then refuses without sending', async () => {
    const forbidden = setup({ allowed: false });
    expect(forbidden.runner.run(hook(), ctx)).toBe(false);
    const { runner, sent } = setup();
    expect(runner.run(hook('no es json {nickname}'), ctx)).toBe(false);
    await flush();
    expect(forbidden.sent).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('given 5 failures in a row, then the circuit opens for that host', async () => {
    const { runner, sent } = setup({ fail: true });
    for (let i = 0; i < BREAKER_FAILURE_LIMIT; i++) {
      expect(runner.run(hook(), ctx)).toBe(true);
      await flush();
    }
    expect(runner.run(hook(), ctx)).toBe(false);
    expect(sent).toHaveLength(BREAKER_FAILURE_LIMIT);
  });

  const request = {
    type: 'spotifyQueue',
    query: '{commandArgs}',
    allowExplicit: false,
    maxDurationS: 600,
  } as const;
  const chat = { vars: { commandArgs: 'bohemian rhapsody' }, eventId: 'e2', ruleId: 9 };

  it('given a song request, then searches the viewer text with the rule policy', async () => {
    const { runner, spotifyCalls, notices } = setup();
    expect(runner.run(request, chat)).toBe(true);
    await flush();
    expect(spotifyCalls).toEqual(['queue:bohemian rhapsody:false:600000']);
    expect(notices).toEqual([]);
  });

  it('given no usable search text or no Spotify, then refuses without calling Spotify', () => {
    const { runner, spotifyCalls } = setup();
    expect(runner.run(request, { ...chat, vars: { commandArgs: '   ' } })).toBe(false);
    expect(runner.run(request, { ...chat, vars: {} })).toBe(false);
    const off = setup({ spotifyConnected: false });
    expect(off.runner.run(request, chat)).toBe(false);
    expect(off.runner.run({ type: 'spotifySkip' }, chat)).toBe(false);
    expect([...spotifyCalls, ...off.spotifyCalls]).toEqual([]);
  });

  it('given a skip, then skips to the next song', async () => {
    const { runner, spotifyCalls } = setup();
    expect(runner.run({ type: 'spotifySkip' }, chat)).toBe(true);
    await flush();
    expect(spotifyCalls).toEqual(['skip']);
  });

  it('given no active device, then tells the streamer in the panel', async () => {
    const { runner, notices } = setup({
      spotifyFailure: new SpotifyError('no device', 'no_device'),
    });
    runner.run(request, chat);
    await flush();
    expect(notices).toEqual([expect.stringContaining('dispositivo activo')]);
  });

  it('given no acceptable song, then does not report an error', async () => {
    const { runner, notices } = setup({ noMatch: true });
    expect(runner.run(request, chat)).toBe(true);
    await flush();
    expect(notices).toEqual([]);
  });
});
