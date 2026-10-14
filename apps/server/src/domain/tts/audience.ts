import type { Scope, TtsAudience, ViewerRef } from '@tiklive/contracts';

/** Answers "is this viewer in the top N of the room's diamond ranking?" without I/O. */
export interface TopGifterLookup {
  isTop(uniqueId: string, top: number, scope: Scope): boolean;
}

function listed(list: readonly string[], uniqueId: string): boolean {
  return list.includes(uniqueId.toLowerCase());
}

/**
 * Whether the voice may read this viewer's text. neverRead wins, then alwaysRead, then
 * `everyone`; otherwise the viewer must belong to at least one enabled group.
 */
export function canReadViewer(
  viewer: ViewerRef,
  audience: TtsAudience,
  top: TopGifterLookup,
): boolean {
  if (listed(audience.neverRead, viewer.uniqueId)) return false;
  if (listed(audience.alwaysRead, viewer.uniqueId)) return true;
  if (audience.everyone) return true;
  return enabledGroups(audience, top).some((belongs) => belongs(viewer));
}

type Group = (viewer: ViewerRef) => boolean;

/** One membership test per enabled group; the top-gifter lookup runs last (it may refresh). */
function enabledGroups(audience: TtsAudience, top: TopGifterLookup): Group[] {
  const { fanClub, globalGifters, topGifters } = audience;
  const groups: [boolean, Group][] = [
    [audience.followers, (v) => v.isFollower],
    [audience.superfans, (v) => v.isSubscriber],
    [audience.moderators, (v) => v.isModerator],
    [fanClub.enabled, (v) => (v.fanClubLevel ?? 0) >= fanClub.minLevel],
    [globalGifters.enabled, (v) => (v.gifterLevel ?? 0) >= globalGifters.minLevel],
    [topGifters.enabled, (v) => top.isTop(v.uniqueId, topGifters.top, topGifters.scope)],
  ];
  return groups.filter(([enabled]) => enabled).map(([, belongs]) => belongs);
}
