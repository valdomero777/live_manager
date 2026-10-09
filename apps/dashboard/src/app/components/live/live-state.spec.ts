import type { ConnectorStatus, LiveEvent } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { activityPerMinute, toFeedItem } from './event-format';
import { liveStateOf } from './live-state';

const status = (state: ConnectorStatus['state'], extra: Partial<ConnectorStatus> = {}) =>
  ({ state, attempt: 0, target: 'ana', ...extra }) as ConnectorStatus;

const viewer = {
  tiktokUserId: '1',
  uniqueId: 'ana',
  nickname: 'Ana',
  isFollower: false,
  isSubscriber: false,
  isModerator: false,
};

describe('liveStateOf', () => {
  it('maps every connector state to one of the UI states', () => {
    expect(liveStateOf(undefined).state).toBe('unknown');
    expect(liveStateOf(status('idle')).state).toBe('disconnected');
    expect(liveStateOf(status('connecting')).state).toBe('connecting');
    expect(liveStateOf(status('waiting_host')).state).toBe('connected');
    expect(liveStateOf(status('connected')).state).toBe('live');
    expect(liveStateOf(status('reconnecting')).state).toBe('reconnecting');
  });

  it('reports a stopped connector with an error as an error, with the reason as hint', () => {
    const view = liveStateOf(status('stopped', { lastError: 'Usuario no encontrado' }));
    expect(view.state).toBe('error');
    expect(view.hint).toBe('Usuario no encontrado');
    expect(view.tone).toBe('danger');
  });

  it('names the account while live', () => {
    const view = liveStateOf(status('connected'));
    expect(view.label).toBe('LIVE');
    expect(view.hint).toContain('@ana');
    expect(view.pulse).toBe(true);
  });
});

describe('event formatting', () => {
  it('describes a gift with its total diamonds', () => {
    const gift = {
      id: 'g1',
      sessionId: 1,
      occurredAt: 0,
      type: 'gift',
      viewer,
      giftId: 5655,
      giftName: 'Rose',
      diamondValue: 1,
      quantity: 5,
      isStreakFinal: true,
    } satisfies LiveEvent;
    const item = toFeedItem(gift);
    expect(item.user).toBe('@ana');
    expect(item.action).toBe('envió 5 × Rose');
    expect(item.detail).toBe('5 diamantes');
  });

  it('counts interactions per minute and ignores older events', () => {
    const now = 10 * 60_000 + 30_000;
    const at = (minute: number) => minute * 60_000 + 1_000;
    const events = [
      { id: 'a', sessionId: 1, occurredAt: at(10), type: 'comment', viewer, text: 'hola' },
      { id: 'b', sessionId: 1, occurredAt: at(10), type: 'follow', viewer },
      {
        id: 'c',
        sessionId: 1,
        occurredAt: at(9),
        type: 'like',
        viewer,
        likeDelta: 50,
        totalLikes: 50,
      },
      { id: 'd', sessionId: 1, occurredAt: at(1), type: 'follow', viewer },
      // two minutes ahead of the browser clock: still counted, in the current minute
      { id: 'e', sessionId: 1, occurredAt: at(12), type: 'comment', viewer, text: 'skew' },
    ] satisfies LiveEvent[];
    const buckets = activityPerMinute(events, now, 3);
    expect(buckets).toHaveLength(3);
    expect(buckets[2]).toMatchObject({ comments: 2, social: 1, likes: 0 });
    expect(buckets[1]).toMatchObject({ likes: 1 });
    expect(buckets[0]).toMatchObject({ comments: 0, social: 0 });
  });
});
