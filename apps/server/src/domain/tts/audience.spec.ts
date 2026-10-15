import { TtsAudienceSchema, type TtsAudience, type ViewerRef } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { canReadViewer, type TopGifterLookup } from './audience.js';

const viewer = (over: Partial<ViewerRef> = {}): ViewerRef => ({
  tiktokUserId: '1',
  uniqueId: 'ana',
  nickname: 'Ana',
  isFollower: false,
  isSubscriber: false,
  isModerator: false,
  ...over,
});

const audience = (over: Record<string, unknown> = {}): TtsAudience =>
  TtsAudienceSchema.parse({ everyone: false, ...over });

const noTop: TopGifterLookup = { isTop: () => false };

describe('canReadViewer', () => {
  it('reads everyone by default', () => {
    expect(canReadViewer(viewer(), TtsAudienceSchema.parse({}), noTop)).toBe(true);
  });

  it('with everyone off, reads nobody unless a group is enabled', () => {
    expect(canReadViewer(viewer({ isFollower: true }), audience(), noTop)).toBe(false);
  });

  it.each([
    ['followers', { isFollower: true }],
    ['superfans', { isSubscriber: true }],
    ['moderators', { isModerator: true }],
  ] as const)('reads %s when that group is enabled', (group, traits) => {
    expect(canReadViewer(viewer(traits), audience({ [group]: true }), noTop)).toBe(true);
    expect(canReadViewer(viewer(), audience({ [group]: true }), noTop)).toBe(false);
  });

  it('fan club needs the minimum level (boundary included)', () => {
    const a = audience({ fanClub: { enabled: true, minLevel: 5 } });
    expect(canReadViewer(viewer({ fanClubLevel: 5 }), a, noTop)).toBe(true);
    expect(canReadViewer(viewer({ fanClubLevel: 4 }), a, noTop)).toBe(false);
    expect(canReadViewer(viewer(), a, noTop)).toBe(false);
  });

  it('global gifters need the TikTok gifter level', () => {
    const a = audience({ globalGifters: { enabled: true, minLevel: 10 } });
    expect(canReadViewer(viewer({ gifterLevel: 12 }), a, noTop)).toBe(true);
    expect(canReadViewer(viewer({ gifterLevel: 9 }), a, noTop)).toBe(false);
  });

  it('top gifters asks the lookup with the configured N and period', () => {
    const calls: unknown[] = [];
    const top: TopGifterLookup = {
      isTop: (id, n, scope) => {
        calls.push([id, n, scope]);
        return id === 'ana';
      },
    };
    const a = audience({ topGifters: { enabled: true, top: 5, scope: 'week' } });
    expect(canReadViewer(viewer(), a, top)).toBe(true);
    expect(canReadViewer(viewer({ uniqueId: 'beto' }), a, top)).toBe(false);
    expect(calls[0]).toEqual(['ana', 5, 'week']);
  });

  it('a disabled group is ignored even if the viewer belongs to it', () => {
    const a = audience({ fanClub: { enabled: false, minLevel: 1 } });
    expect(canReadViewer(viewer({ fanClubLevel: 30 }), a, noTop)).toBe(false);
  });

  it('neverRead wins over everything; alwaysRead wins over the groups (case-insensitive)', () => {
    const a = TtsAudienceSchema.parse({ everyone: true, neverRead: ['@ANA'] });
    expect(canReadViewer(viewer({ isModerator: true }), a, noTop)).toBe(false);
    const b = audience({ alwaysRead: ['Ana'] });
    expect(canReadViewer(viewer(), b, noTop)).toBe(true);
  });
});
