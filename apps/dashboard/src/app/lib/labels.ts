import type { LiveEventType, Metric, Scope } from '@tiklive/contracts';

/** Spanish UI names for domain values, in one place so every screen says the same thing. */
export const EVENT_LABELS: Readonly<Record<LiveEventType, string>> = {
  comment: 'Comentario',
  gift: 'Regalo',
  like: 'Likes',
  follow: 'Nuevo seguidor',
  join: 'Entrada',
  share: 'Compartido',
  viewerCount: 'Espectadores',
  streamEnd: 'Fin del live',
};

export const METRIC_LABELS: Readonly<Record<Metric, string>> = {
  diamonds: 'Diamantes',
  gift_count: 'Cantidad de regalos',
  likes: 'Likes',
};

export const SCOPE_LABELS: Readonly<Record<Scope, string>> = {
  session: 'Este live',
  week: 'Esta semana',
  total: 'Histórico',
};

export const GOAL_METRIC_LABELS = {
  diamonds: 'Diamantes',
  gifts: 'Regalos',
  likes: 'Likes',
} as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
