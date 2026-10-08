import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../domain/shared/time.js';
import { BREAKER_FAILURE_LIMIT } from '../../domain/webhook/circuit-breaker.js';
import { silentLogger } from '../ports/logger.js';
import type { WebhookRequest } from '../ports/webhook-client.js';
import { ServerActionRunner } from './server-action-runner.js';

const hook = (body = '{"u":"{nickname}"}') =>
  ({ type: 'webhook', url: 'https://hooks.example.com/a', method: 'POST', body }) as const;
const ctx = { vars: { nickname: 'Ana "la" mejor' }, eventId: 'e1', ruleId: 7 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(options: { allowed?: boolean; fail?: boolean } = {}) {
  const sent: WebhookRequest[] = [];
  const adjusted: [number, number][] = [];
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
    clock: new FakeClock(0),
    logger: silentLogger,
  });
  return { runner, sent, adjusted };
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
});
