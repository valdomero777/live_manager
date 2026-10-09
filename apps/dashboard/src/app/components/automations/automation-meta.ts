import {
  LucideBell,
  LucideClapperboard,
  LucideListFilter,
  LucideMic,
  LucideTarget,
  LucideVolume2,
  LucideWebhook,
  type LucideIcon,
} from '@lucide/angular';

export interface ActionKind {
  /** Action type in the rule schema; undefined for actions the backend does not support yet. */
  readonly type?: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
  /** Soft background + readable text. */
  readonly tone: string;
}

/**
 * Every action a rule can run, plus the ones planned next. The builder lists them all so the
 * product direction is visible, but only offers the supported ones.
 */
export const ACTION_KINDS: readonly ActionKind[] = [
  {
    type: 'playSound',
    label: 'Reproducir sonido',
    description: 'Suena en la pestaña de audio',
    icon: LucideVolume2,
    tone: 'bg-sound-soft text-sound-text',
  },
  {
    type: 'speak',
    label: 'Leer en voz alta (TTS)',
    description: 'Texto a voz con moderación',
    icon: LucideMic,
    tone: 'bg-automation-soft text-automation-text',
  },
  {
    type: 'showAlert',
    label: 'Mostrar alerta en overlay',
    description: 'Texto e imagen en pantalla',
    icon: LucideBell,
    tone: 'bg-gift-soft text-gift-text',
  },
  {
    type: 'updateGoal',
    label: 'Sumar a una meta',
    description: 'Progreso manual en una meta',
    icon: LucideTarget,
    tone: 'bg-analytics-soft text-analytics-text',
  },
  {
    type: 'webhook',
    label: 'Llamar a un webhook',
    description: 'Enviar JSON a otra app',
    icon: LucideWebhook,
    tone: 'bg-info-soft text-info-text',
  },
  {
    label: 'OBS',
    description: 'Cambiar escena o fuente',
    icon: LucideClapperboard,
    tone: 'bg-surface-active text-muted-foreground',
  },
];

export function actionKind(type: string): ActionKind | undefined {
  return ACTION_KINDS.find((k) => k.type === type);
}

export const CONDITION_ICON: LucideIcon = LucideListFilter;
