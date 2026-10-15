import { FEED_EVENT_TYPES, METRICS, SCOPES, STATS_FIELDS } from '@tiklive/contracts';
import { METRIC_LABELS, SCOPE_LABELS } from '../../lib/labels';

/** "lines": one item per line in the editor, stored in the URL joined by "|". */
export type OverlayParamKind =
  'select' | 'number' | 'text' | 'boolean' | 'multi' | 'goal' | 'rotator' | 'lines';

export interface OverlayParam {
  readonly key: string;
  readonly label: string;
  readonly kind: OverlayParamKind;
  readonly default: string;
  readonly hint?: string;
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

const FEED_LABELS: Readonly<Record<(typeof FEED_EVENT_TYPES)[number], string>> = {
  gift: $localize`Regalos`,
  follow: $localize`Nuevos seguidores`,
  share: $localize`Compartidos`,
  join: $localize`Entradas`,
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
    id: 'topgifter',
    label: $localize`Mejor donador`,
    path: '/overlay/topgifter/',
    help: $localize`Tarjeta con el líder del ranking (regalos, cantidad de regalos o likes).`,
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
    id: 'ticker',
    label: $localize`Cinta de anuncios`,
    path: '/overlay/ticker/',
    help: $localize`Franja inferior con mensajes que se desplazan uno tras otro.`,
    params: [
      {
        key: 'messages',
        label: $localize`Mensajes`,
        kind: 'lines',
        default: '',
        hint: $localize`Un mensaje por línea. Se muestran en orden y en bucle.`,
      },
      {
        key: 'speed',
        label: $localize`Velocidad (px por segundo)`,
        kind: 'number',
        default: '120',
        min: 20,
        max: 600,
        step: 10,
      },
      {
        key: 'pause',
        label: $localize`Pausa entre mensajes (segundos)`,
        kind: 'number',
        default: '2',
        min: 0,
        max: 60,
        step: 1,
      },
      THEME,
      SCALE,
      FONT,
    ],
  },
  {
    id: 'social',
    label: $localize`Redes sociales`,
    path: '/overlay/social/',
    help: $localize`Alterna entre tus perfiles en otras plataformas.`,
    params: [
      {
        key: 'profiles',
        label: $localize`Perfiles`,
        kind: 'lines',
        default: '',
        hint: $localize`Un perfil por línea con el formato plataforma:usuario (youtube:@micanal). Solo se muestran los que escribas.`,
      },
      {
        key: 'interval',
        label: $localize`Segundos por perfil`,
        kind: 'number',
        default: '8',
        min: 2,
        max: 120,
        step: 1,
      },
      THEME,
      SCALE,
      FONT,
    ],
  },
  {
    id: 'feed',
    label: $localize`Últimos eventos`,
    path: '/overlay/feed/',
    help: $localize`Lista de los eventos más recientes del directo (regalos, seguidores, compartidos y entradas); solo muestra lo que llegó de verdad.`,
    params: [
      {
        key: 'types',
        label: $localize`Eventos`,
        kind: 'multi',
        default: 'gift,follow',
        options: FEED_EVENT_TYPES.map((t) => ({ value: t, label: FEED_LABELS[t] })),
      },
      {
        key: 'limit',
        label: $localize`Cuántos mostrar`,
        kind: 'number',
        default: '6',
        min: 1,
        max: 15,
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
    id: 'streak',
    label: $localize`Racha más larga`,
    path: '/overlay/streak/',
    help: $localize`Tarjeta con la racha de regalos más larga de la sesión (mínimo 2 seguidos del mismo regalo); sin rachas completadas no muestra ninguna.`,
    params: [
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

/** A ready-made configuration: picking it loads the overlay with these values, still editable. */
export interface OverlayPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly type: string;
  readonly params: Readonly<Record<string, string>>;
}

export const OVERLAY_PRESETS: readonly OverlayPreset[] = [
  {
    id: 'top-gifts',
    label: $localize`Top regalos del live`,
    description: $localize`Los 5 espectadores que más diamantes enviaron en esta sesión.`,
    type: 'leaderboard',
    params: { metric: 'diamonds', scope: 'session', limit: '5' },
  },
  {
    id: 'top-likes',
    label: $localize`Top likes del live`,
    description: $localize`Los 5 espectadores con más likes en esta sesión.`,
    type: 'leaderboard',
    params: { metric: 'likes', scope: 'session', limit: '5' },
  },
  {
    id: 'weekly-gifts',
    label: $localize`Ranking semanal de regalos`,
    description: $localize`Los 10 mejores donadores de la semana.`,
    type: 'leaderboard',
    params: { metric: 'diamonds', scope: 'week', limit: '10', title: 'Top de la semana' },
  },
  {
    id: 'top-gifter',
    label: $localize`Mejor donador`,
    description: $localize`Tarjeta con quien lidera los regalos de la sesión.`,
    type: 'topgifter',
    params: { metric: 'diamonds', scope: 'session' },
  },
  {
    id: 'top-liker',
    label: $localize`Mejor liker`,
    description: $localize`Tarjeta con quien lidera los likes de la sesión.`,
    type: 'topgifter',
    params: { metric: 'likes', scope: 'session' },
  },
  {
    id: 'goal-bar',
    label: $localize`Barra de meta`,
    description: $localize`Progreso de una meta, con números. Crea la meta en «Rankings y metas».`,
    type: 'goal',
    params: { goalId: '1' },
  },
  {
    id: 'campaign-bar',
    label: $localize`Barra de campaña`,
    description: $localize`Meta global sin reinicio: crea una meta de alcance «total» y elígela aquí.`,
    type: 'goal',
    params: { goalId: '1', theme: 'light' },
  },
  {
    id: 'stats-compact',
    label: $localize`Estadísticas compactas`,
    description: $localize`Espectadores, likes y diamantes en columna.`,
    type: 'stats',
    params: { fields: 'viewers,likes,diamonds', layout: 'column' },
  },
  {
    id: 'last-events',
    label: $localize`Últimos eventos`,
    description: $localize`Regalos y nuevos seguidores recién llegados, el más reciente arriba.`,
    type: 'feed',
    params: { types: 'gift,follow', limit: '6' },
  },
  {
    id: 'last-gifts',
    label: $localize`Últimos regalos`,
    description: $localize`Solo los 5 regalos más recientes.`,
    type: 'feed',
    params: { types: 'gift', limit: '5', title: 'Últimos regalos' },
  },
  {
    id: 'top-streak',
    label: $localize`Racha más larga`,
    description: $localize`Quién envió más unidades seguidas de un mismo regalo en esta sesión.`,
    type: 'streak',
    params: {},
  },
  {
    id: 'ticker',
    label: $localize`Cinta de anuncios`,
    description: $localize`Franja inferior con tus mensajes. Escribe los tuyos antes de usarla.`,
    type: 'ticker',
    params: {},
  },
  {
    id: 'social',
    label: $localize`Redes sociales`,
    description: $localize`Alterna tus perfiles. Añade los tuyos antes de usarla.`,
    type: 'social',
    params: {},
  },
  {
    id: 'alerts',
    label: $localize`Alertas en el centro`,
    description: $localize`Alertas de reglas y metas centradas en pantalla.`,
    type: 'alerts',
    params: { position: 'center' },
  },
];

const LIST_SEPARATOR = '|';

/** Editor text (one item per line) → URL value. Blank lines are dropped. */
export function linesToValue(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replaceAll(LIST_SEPARATOR, ' ').trim())
    .filter((line) => line !== '')
    .join(LIST_SEPARATOR);
}

/** URL value → editor text. */
export function valueToLines(value: string): string {
  return value.split(LIST_SEPARATOR).join('\n');
}
