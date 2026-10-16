import type { LiveEventType, Metric, Scope } from '@tiklive/contracts';

/** Spanish UI names for domain values, in one place so every screen says the same thing. */
export const EVENT_LABELS: Readonly<Record<LiveEventType, string>> = {
  comment: $localize`Comentario`,
  gift: $localize`Regalo`,
  like: $localize`Likes`,
  follow: $localize`Nuevo seguidor`,
  join: $localize`Entrada`,
  share: $localize`Compartido`,
  viewerCount: $localize`Espectadores`,
  streamEnd: $localize`Fin del live`,
};

/** What makes each event start an automation, shown when hovering its option. */
export const EVENT_DESCRIPTIONS: Readonly<Record<LiveEventType, string>> = {
  comment: $localize`Se activa cada vez que un espectador escribe un comentario en el chat.`,
  gift: $localize`Se activa cuando un espectador envía un regalo. Una racha de regalos iguales cuenta una sola vez, al terminar.`,
  like: $localize`Se activa con los toques de «me gusta» de los espectadores, agrupados en ventanas cortas de tiempo.`,
  follow: $localize`Se activa cuando alguien empieza a seguir tu cuenta durante el live.`,
  join: $localize`Se activa cuando un espectador entra a tu live.`,
  share: $localize`Se activa cuando un espectador comparte tu live.`,
  viewerCount: $localize`Se activa cada vez que TikTok actualiza el número de espectadores conectados.`,
  streamEnd: $localize`Se activa una sola vez cuando termina el live.`,
};

export const METRIC_LABELS: Readonly<Record<Metric, string>> = {
  diamonds: $localize`Monedas`,
  gift_count: $localize`Cantidad de regalos`,
  likes: $localize`Likes`,
};

export const SCOPE_LABELS: Readonly<Record<Scope, string>> = {
  session: $localize`Este live`,
  week: $localize`Esta semana`,
  total: $localize`Histórico`,
};

export const GOAL_METRIC_LABELS = {
  diamonds: $localize`Monedas`,
  gifts: $localize`Regalos`,
  likes: $localize`Likes`,
} as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return $localize`${(bytes / 1024).toFixed(0)} KB`;
  return $localize`${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
