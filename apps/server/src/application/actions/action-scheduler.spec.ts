import { describe, expect, it } from 'vitest';
import { FakeScheduler, FakeScreenGateway } from '../../../test/support/fakes.js';
import type { PlannedAction } from '../../domain/rules/actions.js';
import { silentLogger } from '../ports/logger.js';
import { ActionScheduler, MAX_ACTION_AGE_MS, type ActionOutcome } from './action-scheduler.js';

let seq = 0;
function anAction(overrides: Partial<PlannedAction> = {}): PlannedAction {
  const actionId = overrides.actionId ?? `a${++seq}`;
  return {
    actionId,
    screen: 'alerts',
    priority: 0,
    origin: { kind: 'rule', id: 1 },
    eventId: 'e1',
    timeoutMs: 5_000,
    command: { type: 'action.show_alert', payload: { actionId, text: 'hi', durationMs: 3_000 } },
    ...overrides,
  };
}

function setup() {
  const scheduler = new FakeScheduler();
  const gateway = new FakeScreenGateway();
  const outcomes: [string, ActionOutcome][] = [];
  const actions = new ActionScheduler({
    gateway,
    scheduler,
    clock: scheduler.clock,
    logger: silentLogger,
    onOutcome: (a, o) => outcomes.push([a.actionId, o]),
  });
  return { scheduler, gateway, actions, outcomes };
}

describe('ActionScheduler', () => {
  it('sends one action at a time per screen and advances on action.done', () => {
    const { gateway, actions, outcomes } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x' }));
    actions.enqueue(anAction({ actionId: 'y' }));
    expect(gateway.actionIds()).toEqual(['x']);

    actions.acknowledge('alerts', 'x', true);
    expect(gateway.actionIds()).toEqual(['x', 'y']);
    expect(outcomes).toEqual([['x', 'done']]);
  });

  it('respects priority among waiting actions', () => {
    const { gateway, actions } = setup();
    actions.enqueue(anAction({ actionId: 'low', priority: 0 }));
    actions.enqueue(anAction({ actionId: 'high', priority: 90 }));
    gateway.connect('alerts');
    expect(gateway.actionIds()).toEqual(['high']);
  });

  it('given no action.done, when the timeout passes, then marks it failed and continues', () => {
    const { scheduler, gateway, actions, outcomes } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x', timeoutMs: 5_000 }));
    actions.enqueue(anAction({ actionId: 'y' }));
    scheduler.advance(5_000);
    expect(outcomes).toEqual([['x', 'timeout']]);
    expect(gateway.actionIds()).toEqual(['x', 'y']);
  });

  it('given the overlay disconnects mid-action, then requeues it and resends on reconnect', () => {
    const { gateway, actions } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x' }));
    gateway.disconnect('alerts');
    gateway.connect('alerts');
    expect(gateway.actionIds()).toEqual(['x', 'x']);
  });

  it('given 3 failed deliveries, then drops the action', () => {
    const { gateway, actions, outcomes } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x' }));
    for (let i = 0; i < 3; i++) {
      gateway.disconnect('alerts');
      gateway.connect('alerts');
    }
    expect(outcomes).toContainEqual(['x', 'dropped']);
  });

  it('drops actions that waited too long for a screen', () => {
    const { scheduler, gateway, actions, outcomes } = setup();
    actions.enqueue(anAction({ actionId: 'old' }));
    scheduler.advance(MAX_ACTION_AGE_MS + 1);
    gateway.connect('alerts');
    expect(gateway.actionIds()).toEqual([]);
    expect(outcomes).toEqual([['old', 'dropped']]);
  });

  it('ignores acknowledgements for unknown actions', () => {
    const { gateway, actions, outcomes } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x' }));
    actions.acknowledge('alerts', 'other', true);
    actions.acknowledge('nope', 'x', true);
    expect(outcomes).toEqual([]);
  });

  it('reports failures from the screen and clears queues', () => {
    const { gateway, actions, outcomes } = setup();
    gateway.connect('alerts');
    actions.enqueue(anAction({ actionId: 'x' }));
    actions.enqueue(anAction({ actionId: 'y' }));
    actions.enqueue(anAction({ actionId: 'z', screen: 'audio' }));
    actions.acknowledge('alerts', 'x', false, 'decode error');
    expect(actions.depths()).toEqual({ alerts: 1, audio: 1 });
    expect(actions.clear()).toBe(1);
    expect(outcomes).toEqual([
      ['x', 'failed'],
      ['z', 'dropped'],
    ]);
  });
});
