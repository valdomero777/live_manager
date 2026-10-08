import { METRICS, SCOPES, STATS_FIELDS } from '@tiklive/contracts';
import { METRIC_LABELS, SCOPE_LABELS } from '../../shared/labels';

export type OverlayParamKind =
  'select' | 'number' | 'text' | 'boolean' | 'multi' | 'goal' | 'rotator';

export interface OverlayParam {
  readonly key: string;
  readonly label: string;
  readonly kind: OverlayParamKind;
  readonly default: string;
  readonly options?: readonly { value: string; label: string }[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface OverlayType {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly help: string;
  readonly params: readonly OverlayParam[];
}

const THEME: OverlayParam = {
  key: 'theme',
  label: 'Tema',
  kind: 'select',
  default: 'card',
  options: [
    { value: 'card', label: 'Tarjeta oscura' },
    { value: 'clear', label: 'Sin fondo' },
    { value: 'light', label: 'Tarjeta clara' },
  ],
};
const SCALE: OverlayParam = {
  key: 'scale',
  label: 'Escala',
  kind: 'number',
  default: '1',
  min: 0.25,
  max: 4,
  step: 0.05,
};
const FONT: OverlayParam = {
  key: 'font',
  label: 'Fuente del sistema (opcional)',
  kind: 'text',
  default: '',
};
const DEBUG: OverlayParam = {
  key: 'debug',
  label: 'Mostrar estado de conexión',
  kind: 'boolean',
  default: '',
};

const STATS_LABELS: Readonly<Record<(typeof STATS_FIELDS)[number], string>> = {
  viewers: 'Espectadores',
  peakViewers: 'Pico',
  likes: 'Likes',
  diamonds: 'Diamantes',
  newFollowers: 'Nuevos seguidores',
  duration: 'Duración',
};

/** Every overlay page and its URL parameters (spec 12). Defaults are omitted from the URL. */
export const OVERLAY_TYPES: readonly OverlayType[] = [
  {
    id: 'leaderboard',
    label: 'Ranking',
    path: '/overlay/leaderboard/',
    help: 'Top de regalos o likes, con animación al cambiar de posición.',
    params: [
      {
        key: 'metric',
        label: 'Métrica',
        kind: 'select',
        default: 'diamonds',
        options: METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] })),
      },
      {
        key: 'scope',
        label: 'Período',
        kind: 'select',
        default: 'session',
        options: SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] })),
      },
      {
        key: 'limit',
        label: 'Cuántos mostrar',
        kind: 'number',
        default: '5',
        min: 1,
        max: 20,
        step: 1,
      },
      { key: 'title', label: 'Título (opcional)', kind: 'text', default: '' },
      {
        key: 'name',
        label: 'Mostrar',
        kind: 'select',
        default: '',
        options: [
          { value: '', label: 'Apodo' },
          { value: 'alias', label: '@usuario' },
        ],
      },
      THEME,
      SCALE,
      FONT,
      DEBUG,
    ],
  },
  {
    id: 'goal',
    label: 'Meta',
    path: '/overlay/goal/',
    help: 'Barra de progreso de una meta.',
    params: [
      { key: 'goalId', label: 'Meta', kind: 'goal', default: '1' },
      {
        key: 'showNumbers',
        label: 'Números',
        kind: 'select',
        default: '',
        options: [
          { value: '', label: 'Mostrar' },
          { value: '0', label: 'Ocultar' },
        ],
      },
      THEME,
      SCALE,
      FONT,
      DEBUG,
    ],
  },
  {
    id: 'stats',
    label: 'Estadísticas',
    path: '/overlay/stats/',
    help: 'Contadores del live.',
    params: [
      {
        key: 'fields',
        label: 'Datos',
        kind: 'multi',
        default: 'viewers,likes,diamonds',
        options: STATS_FIELDS.map((f) => ({ value: f, label: STATS_LABELS[f] })),
      },
      {
        key: 'layout',
        label: 'Disposición',
        kind: 'select',
        default: 'row',
        options: [
          { value: 'row', label: 'En fila' },
          { value: 'column', label: 'En columna' },
        ],
      },
      THEME,
      SCALE,
      FONT,
      DEBUG,
    ],
  },
  {
    id: 'rotator',
    label: 'Rotator',
    path: '/overlay/rotator/',
    help: 'Varios paneles alternándose en una sola fuente (recomendado: menos consumo).',
    params: [
      { key: 'config', label: 'Configuración', kind: 'rotator', default: 'main' },
      THEME,
      SCALE,
      FONT,
      DEBUG,
    ],
  },
  {
    id: 'alerts',
    label: 'Alertas',
    path: '/screen/alerts/',
    help: 'Alertas de las reglas y metas (imagen + texto).',
    params: [
      {
        key: 'position',
        label: 'Posición',
        kind: 'select',
        default: 'center',
        options: [
          { value: 'top', label: 'Arriba' },
          { value: 'center', label: 'Centro' },
          { value: 'bottom', label: 'Abajo' },
        ],
      },
      SCALE,
      DEBUG,
    ],
  },
  {
    id: 'audio',
    label: 'Pestaña de audio',
    path: '/screen/audio/',
    help: 'Ábrela en un navegador de la PC de stream (no como fuente) y pulsa «Iniciar audio».',
    params: [
      {
        key: 'master',
        label: 'Volumen inicial',
        kind: 'number',
        default: '1',
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
];

export function buildOverlayUrl(
  type: OverlayType,
  values: Readonly<Record<string, string>>,
  key: string,
  origin: string,
): string {
  const query = new URLSearchParams();
  for (const p of type.params) {
    const value = values[p.key] ?? p.default;
    // Selects keep "rotator"/"goal" ids even when equal to the default, for clarity.
    const keep =
      p.kind === 'goal' ||
      p.kind === 'rotator' ||
      (p.key === 'metric' && type.id === 'leaderboard');
    if (value !== '' && (keep || value !== p.default)) query.set(p.key, value);
  }
  query.set('key', key);
  return `${origin}${type.path}?${query.toString()}`;
}
