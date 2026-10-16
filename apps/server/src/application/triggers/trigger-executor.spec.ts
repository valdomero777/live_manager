import type { LiveEvent, Trigger } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { SequentialIds } from '../../../test/support/fakes.js';
import type { PlannedAction } from '../../domain/rules/actions.js';
import { FakeClock, type Random } from '../../domain/shared/time.js';
import { silentLogger } from '../ports/logger.js';
import type { TriggerRepository } from '../ports/trigger-repository.js';
import { TriggerExecutor } from './trigger-executor.js';

function aTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 1,
    name: 'Nuevo seguidor',
    event: 'follow',
    soundId: 'vine-boom-sound-70972',
    soundTitle: 'VINE BOOM SOUND',
    soundUrl: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
    soundPageUrl: 'https://www.myinstants.com/en/instant/vine-boom-sound-70972/',
    source: 'myinstants',
    volume: 0.8,
    cooldownMs: 0,
    probability: 1,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function setup(stored: Trigger[], roll = 0) {
  const clock = new FakeClock(1_000);
  const random: Random = { next: () => roll };
  const queued: PlannedAction[] = [];
  const repo = { listAll: () => Promise.resolve(stored) } as unknown as TriggerRepository;
  const executor = new TriggerExecutor({
    repo,
    sink: { enqueue: (a) => queued.push(a) },
    ids: new SequentialIds(),
    clock,
    random,
    logger: silentLogger,
  });
  return { executor, queued, clock };
}

const followEvent = { id: 'evt-1', type: 'follow' } as unknown as LiveEvent;

describe('TriggerExecutor', () => {
  it('queues the stored URL and volume on the audio screen', () => {
    const { executor, queued } = setup([]);
    expect(executor.execute(aTrigger())).toBe('queued');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      screen: 'audio',
      origin: { kind: 'trigger', id: 1 },
      command: {
        type: 'action.play_sound',
        payload: {
          url: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
          volume: 0.8,
          triggerId: 1,
        },
      },
    });
    const first = queued[0] as PlannedAction;
    expect(first.command.payload).toMatchObject({ actionId: first.actionId });
  });

  it('does nothing for a disabled trigger unless it is a manual test', () => {
    const { executor, queued } = setup([]);
    const off = aTrigger({ enabled: false });
    expect(executor.execute(off)).toBe('disabled');
    expect(queued).toHaveLength(0);
    expect(executor.execute(off, { test: true })).toBe('queued');
    expect(queued).toHaveLength(1);
  });

  it('refuses a sound URL outside the allowed hosts', () => {
    const { executor, queued } = setup([]);
    expect(executor.execute(aTrigger({ soundUrl: 'https://evil.example/a.mp3' }))).toBe('invalid');
    expect(executor.execute(aTrigger({ soundUrl: '' }))).toBe('invalid');
    expect(queued).toHaveLength(0);
  });

  it('fires only enabled triggers whose event matches', async () => {
    const { executor, queued } = setup([
      aTrigger({ id: 1 }),
      aTrigger({ id: 2, enabled: false }),
      aTrigger({ id: 3, event: 'gift' }),
    ]);
    await executor.reload();
    executor.handle(followEvent);
    expect(queued.map((a) => a.origin.id)).toEqual([1]);
    expect(queued[0]?.eventId).toBe('evt-1');
  });

  it('sends the cut-off to the screen and extends the ack timeout with it', () => {
    const { executor, queued } = setup([]);
    executor.execute(aTrigger({ maxMs: 3_000 }));
    expect(queued[0]?.command.payload).toMatchObject({ maxMs: 3_000 });
    expect(queued[0]?.timeoutMs).toBeLessThan(10_000);
  });

  it('plays an uploaded library sound by its /media/ path', () => {
    const { executor, queued } = setup([]);
    const library = aTrigger({ source: 'library', soundUrl: '/media/abc123.mp3' });
    expect(executor.execute(library)).toBe('queued');
    expect(queued[0]?.command.payload).toMatchObject({ url: '/media/abc123.mp3' });
    expect(executor.execute(aTrigger({ source: 'library', soundUrl: '/etc/passwd' }))).toBe(
      'invalid',
    );
  });

  it('honours the cooldown between plays and starts fresh after a reload', async () => {
    const { executor, queued, clock } = setup([aTrigger({ cooldownMs: 5_000 })]);
    await executor.reload();
    executor.handle(followEvent);
    clock.advance(4_999);
    executor.handle(followEvent);
    expect(queued).toHaveLength(1);
    clock.advance(1);
    executor.handle(followEvent);
    expect(queued).toHaveLength(2);
    await executor.reload();
    executor.handle(followEvent);
    expect(queued).toHaveLength(3);
  });

  it('skips events when the probability roll fails, but never in a manual test', async () => {
    const { executor, queued } = setup([aTrigger({ probability: 0.25 })], 0.5);
    await executor.reload();
    executor.handle(followEvent);
    expect(queued).toHaveLength(0);
    expect(executor.execute(aTrigger({ probability: 0.25 }), { test: true })).toBe('queued');
    const lucky = setup([aTrigger({ probability: 0.25 })], 0.1);
    await lucky.executor.reload();
    lucky.executor.handle(followEvent);
    expect(lucky.queued).toHaveLength(1);
  });
});
