import type { ConnectorState } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { FakeScheduler } from '../../../test/support/fakes.js';
import { SimulatedSource } from '../../infrastructure/simulator/simulated-source.adapter.js';
import { ConnectFailure } from '../ports/live-event-source.js';
import { silentLogger } from '../ports/logger.js';
import { ConnectorSupervisor } from './connector-supervisor.js';

function setup() {
  const scheduler = new FakeScheduler();
  const source = new SimulatedSource();
  const supervisor = new ConnectorSupervisor({
    source,
    scheduler,
    clock: scheduler.clock,
    random: { next: () => 0 },
    logger: silentLogger,
  });
  const states: ConnectorState[] = [];
  supervisor.onStatus((s) => states.push(s.state));
  return { scheduler, source, supervisor, states };
}

/** Lets pending promise continuations (the async start()) run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ConnectorSupervisor', () => {
  it('given a reachable source, when connecting, then ends connected', async () => {
    const { supervisor, states } = setup();
    await supervisor.connect('alan');
    expect(states).toEqual(['connecting', 'connected']);
    expect(supervisor.status()).toMatchObject({ state: 'connected', target: 'alan', attempt: 0 });
  });

  it('given a dropped connection, when backoff elapses, then reconnects by itself (RF-02)', async () => {
    const { supervisor, source, scheduler } = setup();
    await supervisor.connect('alan');

    source.dropConnection('network down');
    expect(supervisor.status()).toMatchObject({ state: 'reconnecting', attempt: 1 });

    scheduler.advance(1_000);
    await settle();
    expect(supervisor.status().state).toBe('connected');
  });

  it('given repeated network failures, when retrying, then delays grow exponentially', async () => {
    const { supervisor, source, scheduler } = setup();
    source.failNextStart(new ConnectFailure('network', 'boom'));
    await supervisor.connect('alan');
    expect(supervisor.status().nextRetryAt).toBe(scheduler.clock.now() + 1_000);

    source.failNextStart(new ConnectFailure('network', 'boom'));
    scheduler.advance(1_000);
    await settle();
    expect(supervisor.status()).toMatchObject({ state: 'reconnecting', attempt: 2 });
    expect(supervisor.status().nextRetryAt).toBe(scheduler.clock.now() + 2_000);
  });

  it('given the host is offline, when connecting, then waits 30s and tries again', async () => {
    const { supervisor, source, scheduler } = setup();
    source.failNextStart(new ConnectFailure('host_offline', 'not live'));
    await supervisor.connect('alan');
    expect(supervisor.status().state).toBe('waiting_host');

    scheduler.advance(29_999);
    await settle();
    expect(supervisor.status().state).toBe('waiting_host');
    scheduler.advance(1);
    await settle();
    expect(supervisor.status().state).toBe('connected');
  });

  it('given a cancelled attempt, when it fails, then stops without retrying', async () => {
    const { supervisor, source, scheduler } = setup();
    source.failNextStart(new ConnectFailure('cancelled', 'user'));
    await supervisor.connect('alan');
    expect(supervisor.status().state).toBe('stopped');
    expect(scheduler.pending).toBe(0);
  });

  it('given protocol failures beyond the limit, when retrying, then stops', async () => {
    const { supervisor, source, scheduler } = setup();
    for (let i = 0; i < 6; i++) {
      source.failNextStart(new ConnectFailure('protocol', 'sign'));
      if (i === 0) await supervisor.connect('alan');
      else {
        scheduler.advance(60_000);
        await settle();
      }
    }
    expect(supervisor.status().state).toBe('stopped');
  });

  it('given 60s of stable connection, when elapsed, then the attempt counter resets', async () => {
    const { supervisor, source, scheduler } = setup();
    source.failNextStart(new ConnectFailure('network', 'x'));
    await supervisor.connect('alan');
    scheduler.advance(1_000);
    await settle();
    expect(supervisor.status()).toMatchObject({ state: 'connected', attempt: 1 });
    scheduler.advance(60_000);
    expect(supervisor.status().attempt).toBe(0);
  });

  it('given a pending retry, when stopped, then no retry fires and state is idle', async () => {
    const { supervisor, source, scheduler } = setup();
    source.failNextStart(new ConnectFailure('network', 'x'));
    await supervisor.connect('alan');
    await supervisor.stop();
    scheduler.advance(60_000);
    await settle();
    expect(supervisor.status().state).toBe('idle');
    expect(source.isConnected).toBe(false);
  });

  it('wraps unknown errors as network failures', async () => {
    const { supervisor, source } = setup();
    source.start = () => Promise.reject(new Error('weird'));
    await supervisor.connect('alan');
    expect(supervisor.status()).toMatchObject({ state: 'reconnecting', lastError: 'weird' });
  });
});
