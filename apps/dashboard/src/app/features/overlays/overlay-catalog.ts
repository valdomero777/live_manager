import { METRICS, SCOPES, STATS_FIELDS } from '@tiklive/contracts';
import { METRIC_LABELS, SCOPE_LABELS } from '../../lib/labels';

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
  label: $localize`Tema`,
  kind: 'select',
  default: 'card',
  options: [
    { value: 'card', label: $localize`Tarjeta oscura` },
    { value: 'clear', label: $localize`Sin fondo` },
    { value: 'light', label: $localize`Tarjeta clara` },
  ],
};
const SCALE: OverlayParam = {
  key: 'scale',
  label: $localize`Escala`,
  kind: 'number',
  default: '1',
  min: 0.25,
  max: 4,
  step: 0.05,
};
const FONT: OverlayParam = {
  key: 'font',
  label: $localize`Fuente del sistema (opcional)`,
  kind: 'text',
  default: '',
};
const DEBUG: OverlayParam = {
  key: 'debug',
  label: $localize`Mostrar estado de conexión`,
  kind: 'boolean',
  default: '',
};

const STATS_LABELS: Readonly<Record<(typeof STATS_FIELDS)[number], string>> = {
  viewers: $localize`Espectadores`,
  peakViewers: $localize`Pico`,
  likes: $localize`Likes`,
  diamonds: $localize`Diamantes`,
  newFollowers: $localize`Nuevos seguidores`,
  duration: $localize`Duración`,
};

/** Every overlay page and its URL parameters (spec 12). Defaults are omitted from the URL. */
export const OVERLAY_TYPES: readonly OverlayType[] = [
  {
    id: 'leaderboard',
    label: $localize`Ranking`,
    path: '/overlay/leaderboard/',
    help: $localize`Top de regalos o likes, con animación al cambiar de posición.`,
    params: [
      {
        key: 'metric',
        label: $localize`Métrica`,
        kind: 'select',
        default: 'diamonds',
        options: METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] })),
      },
      {
        key: 'scope',
        label: $localize`Período`,
        kind: 'select',
        default: 'session',
        options: SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] })),
      },
      {
        key: 'limit',
        label: $localize`Cuántos mostrar`,
        kind: 'number',
        default: '5',
        min: 1,
        max: 20,
        step: 1,
      },
      { key: 'title', label: $localize`Título (opcional)`, kind: 'text', default: '' },
      {
        key: 'name',
        label: $localize`Mostrar`,
        kind: 'select',
        default: '',
        options: [
          { value: '', label: $localize`Apodo` },
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
    label: $localize`Meta`,
    path: '/overlay/goal/',
    help: $localize`Barra de progreso de una meta.`,
    params: [
      { key: 'goalId', label: $localize`Meta`, kind: 'goal', default: '1' },
      {
        key: 'showNumbers',
        label: $localize`Números`,
        kind: 'select',
        default: '',
        options: [
          { value: '', label: $localize`Mostrar` },
          { value: '0', label: $localize`Ocultar` },
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
    label: $localize`Estadísticas`,
    path: '/overlay/stats/',
    help: $localize`Contadores del live.`,
    params: [
      {
        key: 'fields',
        label: $localize`Datos`,
        kind: 'multi',
        default: 'viewers,likes,diamonds',
        options: STATS_FIELDS.map((f) => ({ value: f, label: STATS_LABELS[f] })),
      },
      {
        key: 'layout',
        label: $localize`Disposición`,
        kind: 'select',
        default: 'row',
        options: [
          { value: 'row', label: $localize`En fila` },
          { value: 'column', label: $localize`En columna` },
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
    label: $localize`Rotator`,
    path: '/overlay/rotator/',
    help: $localize`Varios paneles alternándose en una sola fuente (recomendado: menos consumo).`,
    params: [
      { key: 'config', label: $localize`Configuración`, kind: 'rotator', default: 'main' },
      THEME,
      SCALE,
      FONT,
      DEBUG,
    ],
  },
  {
    id: 'alerts',
    label: $localize`Alertas`,
    path: '/screen/alerts/',
    help: $localize`Alertas de las reglas y metas (imagen + texto).`,
    params: [
      {
        key: 'position',
        label: $localize`Posición`,
        kind: 'select',
        default: 'center',
        options: [
          { value: 'top', label: $localize`Arriba` },
          { value: 'center', label: $localize`Centro` },
          { value: 'bottom', label: $localize`Abajo` },
        ],
      },
      SCALE,
      DEBUG,
    ],
  },
  {
    id: 'audio',
    label: $localize`Pestaña de audio`,
    path: '/screen/audio/',
    help: $localize`Opcional: el panel ya reproduce el sonido. Úsala solo para llevar el audio a otra PC (ábrela en un navegador y pulsa «Iniciar audio»).`,
    params: [
      {
        key: 'master',
        label: $localize`Volumen inicial`,
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
