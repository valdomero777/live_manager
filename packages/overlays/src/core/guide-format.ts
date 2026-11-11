import type { GuideAction } from '@tiklive/contracts';
import { formatNumber } from './dom.js';

/** One reaction as the audience reads it: a sound, a spoken phrase or an on-screen alert. */
export function describeAction(action: GuideAction): string {
  if (action.kind === 'sound') return '🔊 Sonido';
  const quoted = action.text ? `: «${action.text}»` : '';
  return action.kind === 'speech' ? `🗣 Voz${quoted}` : `🔔 Alerta${quoted}`;
}

export function describeCost(diamonds: number | undefined): string {
  return diamonds === undefined ? '' : `${formatNumber(diamonds)} 💎`;
}
