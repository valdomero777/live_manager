import {
  LucideCircleStop,
  LucideEye,
  LucideGift,
  LucideHeart,
  LucideLogIn,
  LucideMessageCircle,
  LucideShare2,
  LucideUserPlus,
  type LucideIcon,
} from '@lucide/angular';
import type { LiveEventType } from '@tiklive/contracts';
import { EVENT_LABELS } from '../../lib/labels';
import type { BadgeVariant } from '../ui/badge';

export interface EventMeta {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Soft background + readable text for the event's domain color. */
  readonly tone: string;
  readonly badge: BadgeVariant;
}

/** One icon and one color per event type, used everywhere events appear. */
export const EVENT_META: Readonly<Record<LiveEventType, EventMeta>> = {
  gift: {
    label: EVENT_LABELS.gift,
    icon: LucideGift,
    tone: 'bg-gift-soft text-gift-text',
    badge: 'gift',
  },
  like: {
    label: EVENT_LABELS.like,
    icon: LucideHeart,
    tone: 'bg-live-soft text-live-text',
    badge: 'live',
  },
  comment: {
    label: EVENT_LABELS.comment,
    icon: LucideMessageCircle,
    tone: 'bg-comment-soft text-comment-text',
    badge: 'comment',
  },
  follow: {
    label: EVENT_LABELS.follow,
    icon: LucideUserPlus,
    tone: 'bg-follow-soft text-follow-text',
    badge: 'follow',
  },
  join: {
    label: EVENT_LABELS.join,
    icon: LucideLogIn,
    tone: 'bg-surface-active text-muted-foreground',
    badge: 'secondary',
  },
  share: {
    label: EVENT_LABELS.share,
    icon: LucideShare2,
    tone: 'bg-analytics-soft text-analytics-text',
    badge: 'analytics',
  },
  viewerCount: {
    label: EVENT_LABELS.viewerCount,
    icon: LucideEye,
    tone: 'bg-surface-active text-muted-foreground',
    badge: 'secondary',
  },
  streamEnd: {
    label: EVENT_LABELS.streamEnd,
    icon: LucideCircleStop,
    tone: 'bg-danger-soft text-danger-text',
    badge: 'danger',
  },
};
