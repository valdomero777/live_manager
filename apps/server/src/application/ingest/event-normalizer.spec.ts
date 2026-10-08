import { describe, expect, it } from 'vitest';
import { aRawGift, aRawLike, aViewer } from '../../../test/support/builders.js';
import { SequentialIds } from '../../../test/support/fakes.js';
import { FakeClock } from '../../domain/shared/time.js';
import { EventNormalizer, type DropReason } from './event-normalizer.js';

function setup() {
  const clock = new FakeClock(0);
  const drops: DropReason[] = [];
  const normalizer = new EventNormalizer({
    clock,
    ids: new SequentialIds(),
    onDrop: (r) => drops.push(r),
  });
  return { clock, normalizer, drops };
}

describe('EventNormalizer', () => {
  it('maps a comment to a validated LiveEvent with id and dedupeKey', () => {
    const { normalizer } = setup();
    const out = normalizer.push(1, {
      kind: 'comment',
      viewer: aViewer(),
      text: 'hola',
      occurredAt: 5,
      msgId: 'm1',
    });
    expect(out).toEqual([
      expect.objectContaining({
        type: 'comment',
        id: 'id-1',
        sessionId: 1,
        dedupeKey: 'm1',
        text: 'hola',
      }),
    ]);
  });

  it('given a repeated msgId, when pushed, then drops it as duplicate', () => {
    const { normalizer, drops } = setup();
    const raw = { kind: 'follow' as const, viewer: aViewer(), occurredAt: 5, msgId: 'm1' };
    normalizer.push(1, raw);
    expect(normalizer.push(1, raw)).toEqual([]);
    expect(drops).toEqual(['duplicate']);
  });

  it('given a streak of 10 gifts, then emits exactly one final gift event (RF-03)', () => {
    const { normalizer } = setup();
    const out = Array.from({ length: 10 }, (_, i) =>
      normalizer.push(1, aRawGift({ quantity: i + 1, streakEnded: i === 9, msgId: `g${i}` })),
    ).flat();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'gift',
      quantity: 10,
      isStreakFinal: true,
      dedupeKey: 'g9',
    });
  });

  it('buffers likes until the window flushes', () => {
    const { normalizer, clock } = setup();
    expect(normalizer.push(1, aRawLike({ likeCount: 3 }))).toEqual([]);
    clock.advance(1_000);
    expect(normalizer.flush()).toEqual([expect.objectContaining({ type: 'like', likeDelta: 3 })]);
  });

  it('given a stream end, then flushes open buffers before the end event', () => {
    const { normalizer } = setup();
    normalizer.push(1, aRawGift({ quantity: 2 }));
    const out = normalizer.push(1, { kind: 'streamEnd', occurredAt: 9 });
    expect(out.map((e) => e.type)).toEqual(['gift', 'streamEnd']);
  });

  it('given an invalid raw event, then drops it as invalid', () => {
    const { normalizer, drops } = setup();
    const out = normalizer.push(1, {
      kind: 'comment',
      viewer: aViewer({ tiktokUserId: '' }),
      text: 'x',
      occurredAt: 1,
    });
    expect(out).toEqual([]);
    expect(drops).toEqual(['invalid']);
  });

  it('maps viewer counts without deduplication', () => {
    const { normalizer } = setup();
    expect(normalizer.push(1, { kind: 'viewerCount', viewerCount: 7, occurredAt: 1 })).toEqual([
      expect.objectContaining({ type: 'viewerCount', viewerCount: 7 }),
    ]);
  });
});
