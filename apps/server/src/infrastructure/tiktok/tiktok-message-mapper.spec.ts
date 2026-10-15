import { describe, expect, it } from 'vitest';
import { mapViewer } from './tiktok-message-mapper.js';

const user = { id: '7', displayId: 'ana', nickname: 'Ana' };

describe('mapViewer', () => {
  it('maps identity flags and leaves the levels out when TikTok sends none', () => {
    const viewer = mapViewer({
      user,
      userIdentity: { isFollowerOfAnchor: true, isSubscriberOfAnchor: true },
    });
    expect(viewer).toEqual({
      tiktokUserId: '7',
      uniqueId: 'ana',
      nickname: 'Ana',
      isFollower: true,
      isSubscriber: true,
      isModerator: false,
    });
  });

  it('reads the gifter level from its badge, or from payGrade', () => {
    const badge = { sceneType: 8, privilegeLogExtra: { level: '23' } };
    expect(mapViewer({ user: { ...user, badgeList: [badge] } })?.gifterLevel).toBe(23);
    expect(mapViewer({ user: { ...user, payGrade: { level: 12 } } })?.gifterLevel).toBe(12);
  });

  it('reads the fan club level only for an active membership, else from its badge', () => {
    const active = { data: { level: 9, userFansClubStatus: 1 } };
    const lapsed = { data: { level: 9, userFansClubStatus: 2 } };
    expect(mapViewer({ user: { ...user, fansClub: active } })?.fanClubLevel).toBe(9);
    expect(mapViewer({ user: { ...user, fansClub: lapsed } })).not.toHaveProperty('fanClubLevel');
    const badge = { sceneType: 10, privilegeLogExtra: { level: '4' } };
    expect(mapViewer({ user: { ...user, badgeList: [badge] } })?.fanClubLevel).toBe(4);
  });
});
