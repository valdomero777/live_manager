import type { RawLiveEvent, ViewerRef } from '@tiklive/contracts';

/**
 * Minimal structural views of tiktok-live-connector v2 messages (tiktok-live-proto v3).
 * Only the fields we read are declared, so a protocol change surfaces here and nowhere else.
 */
interface ImageLike {
  urlList?: string[];
}
interface UserLike {
  id?: string;
  displayId?: string;
  nickname?: string;
  avatarThumb?: ImageLike | undefined;
  followInfo?: { followStatus?: string } | undefined;
}
interface IdentityLike {
  isFollowerOfAnchor?: boolean;
  isSubscriberOfAnchor?: boolean;
  isModeratorOfAnchor?: boolean;
}
interface CommonLike {
  msgId?: string;
  createTime?: string;
}
export interface SocialMessageLike {
  common?: CommonLike | undefined;
  user?: UserLike | undefined;
  userIdentity?: IdentityLike | undefined;
}
type BaseMessage = SocialMessageLike;
export interface ChatMessageLike extends BaseMessage {
  content?: string;
}
export interface GiftMessageLike extends BaseMessage {
  giftId?: string;
  repeatCount?: number;
  repeatEnd?: number;
  gift?:
    | {
        id?: string;
        name?: string;
        diamondCount?: number;
        type?: number;
        combo?: boolean;
        image?: ImageLike | undefined;
      }
    | undefined;
}
export interface LikeMessageLike extends BaseMessage {
  count?: number;
  total?: string;
}
export interface RoomUserMessageLike {
  common?: CommonLike | undefined;
  total?: string;
  totalUser?: string;
}

/** Gift type 1 is the streakable ("combo") kind in TikTok's gift catalogue. */
const STREAKABLE_GIFT_TYPE = 1;

function toInt(value: string | number | undefined, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function meta(common: CommonLike | undefined, now: number): { occurredAt: number; msgId?: string } {
  const created = toInt(common?.createTime);
  const occurredAt = created > 0 ? created : now;
  const msgId = common?.msgId;
  return msgId && msgId !== '0' ? { occurredAt, msgId } : { occurredAt };
}

function isFollower(user: UserLike, identity: IdentityLike | undefined): boolean {
  return identity?.isFollowerOfAnchor ?? toInt(user.followInfo?.followStatus) > 0;
}

export function mapViewer(message: BaseMessage): ViewerRef | null {
  const user = message.user;
  if (!user?.id) return null;
  const identity = message.userIdentity;
  const avatarUrl = user.avatarThumb?.urlList?.[0];
  const uniqueId = user.displayId || user.id;
  return {
    tiktokUserId: user.id,
    uniqueId,
    nickname: user.nickname || uniqueId,
    ...(avatarUrl ? { avatarUrl } : {}),
    isFollower: isFollower(user, identity),
    isSubscriber: identity?.isSubscriberOfAnchor === true,
    isModerator: identity?.isModeratorOfAnchor === true,
  };
}

export function mapChat(msg: ChatMessageLike, now: number): RawLiveEvent | null {
  const viewer = mapViewer(msg);
  if (!viewer || msg.content === undefined) return null;
  return { kind: 'comment', viewer, text: msg.content, ...meta(msg.common, now) };
}

export function mapGift(msg: GiftMessageLike, now: number): RawLiveEvent | null {
  const viewer = mapViewer(msg);
  const gift = msg.gift;
  if (!viewer || !gift) return null;
  const imageUrl = gift.image?.urlList?.[0];
  return {
    kind: 'gift',
    viewer,
    giftId: toInt(msg.giftId ?? gift.id),
    giftName: gift.name ?? 'Gift',
    ...(imageUrl ? { giftImageUrl: imageUrl } : {}),
    diamondValue: toInt(gift.diamondCount),
    quantity: Math.max(1, toInt(msg.repeatCount, 1)),
    streakable: gift.combo === true || gift.type === STREAKABLE_GIFT_TYPE,
    streakEnded: msg.repeatEnd === 1,
    ...meta(msg.common, now),
  };
}

export function mapLike(msg: LikeMessageLike, now: number): RawLiveEvent | null {
  const viewer = mapViewer(msg);
  if (!viewer) return null;
  const total = toInt(msg.total, -1);
  return {
    kind: 'like',
    viewer,
    likeCount: Math.max(0, toInt(msg.count)),
    ...(total >= 0 ? { totalLikes: total } : {}),
    ...meta(msg.common, now),
  };
}

export function mapSocial(
  kind: 'follow' | 'join' | 'share',
  msg: BaseMessage,
  now: number,
): RawLiveEvent | null {
  const viewer = mapViewer(msg);
  return viewer ? { kind, viewer, ...meta(msg.common, now) } : null;
}

export function mapRoomUser(msg: RoomUserMessageLike, now: number): RawLiveEvent {
  // Viewer counts are state, not facts: no msgId so they are never deduplicated.
  const { occurredAt } = meta(msg.common, now);
  return {
    kind: 'viewerCount',
    viewerCount: Math.max(0, toInt(msg.total ?? msg.totalUser)),
    occurredAt,
  };
}
