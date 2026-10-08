import type { ActionConfig, ConditionConfig, LiveEventType, Rule } from '@tiklive/contracts';

export type ParamKind =
  'text' | 'number' | 'seconds' | 'percent' | 'select' | 'boolean' | 'sound' | 'visual';

export interface ParamDef {
  readonly key: string;
  readonly label: string;
  readonly kind: ParamKind;
  readonly default: string | number | boolean | null;
  readonly options?: readonly { value: string; label: string }[];
  readonly help?: string;
  /** Empty value is sent as "absent" (e.g. an alert without image). */
  readonly optional?: boolean;
}

export interface TypeDef {
  readonly type: string;
  readonly label: string;
  readonly help: string;
  /** Triggers where the condition makes sense (undefined = all). */
  readonly appliesTo?: readonly LiveEventType[];
  readonly params: readonly ParamDef[];
}

const NUMERIC_OPS = [
  { value: 'gte', label: 'al menos (≥)' },
  { value: 'eq', label: 'igual a (=)' },
  { value: 'lte', label: 'como máximo (≤)' },
  { value: 'gt', label: 'más de (>)' },
  { value: 'lt', label: 'menos de (<)' },
];

/**
 * UI description of every condition type. Adding a condition = one entry here (the editor
 * renders it generically), mirroring ConditionRegistry on the server.
 */
export const CONDITION_TYPES: readonly TypeDef[] = [
  {
    type: 'giftName',
    label: 'Nombre del regalo',
    help: 'Compara el nombre del regalo, sin distinguir mayúsculas.',
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: 'Comparación',
        kind: 'select',
        default: 'eq',
        options: [
          { value: 'eq', label: 'es' },
          { value: 'neq', label: 'no es' },
          { value: 'contains', label: 'contiene' },
        ],
      },
      { key: 'value', label: 'Regalo', kind: 'text', default: 'Rose' },
    ],
  },
  {
    type: 'giftId',
    label: 'ID del regalo',
    help: 'Útil si el nombre cambia según el idioma.',
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: 'Comparación',
        kind: 'select',
        default: 'eq',
        options: [
          { value: 'eq', label: 'es' },
          { value: 'neq', label: 'no es' },
        ],
      },
      { key: 'value', label: 'ID', kind: 'number', default: 5655 },
    ],
  },
  {
    type: 'diamondsTotal',
    label: 'Diamantes del regalo',
    help: 'Diamantes por unidad × cantidad de la racha.',
    appliesTo: ['gift'],
    params: [
      { key: 'op', label: 'Comparación', kind: 'select', default: 'gte', options: NUMERIC_OPS },
      { key: 'value', label: 'Diamantes', kind: 'number', default: 100 },
    ],
  },
  {
    type: 'quantity',
    label: 'Cantidad del regalo',
    help: 'Cantidad total de la racha consolidada.',
    appliesTo: ['gift'],
    params: [
      { key: 'op', label: 'Comparación', kind: 'select', default: 'gte', options: NUMERIC_OPS },
      { key: 'value', label: 'Cantidad', kind: 'number', default: 10 },
    ],
  },
  {
    type: 'likesCumulative',
    label: 'Likes acumulados del usuario',
    help: 'Likes del usuario en este live.',
    appliesTo: ['like'],
    params: [
      {
        key: 'mode',
        label: 'Cuándo',
        kind: 'select',
        default: 'every',
        options: [
          { value: 'every', label: 'cada vez que suma' },
          { value: 'threshold', label: 'una vez al llegar a' },
        ],
      },
      { key: 'value', label: 'Likes', kind: 'number', default: 100 },
    ],
  },
  {
    type: 'userRole',
    label: 'Tipo de usuario',
    help: 'Solo para seguidores, suscriptores o moderadores.',
    params: [
      {
        key: 'role',
        label: 'Debe ser',
        kind: 'select',
        default: 'follower',
        options: [
          { value: 'follower', label: 'seguidor' },
          { value: 'subscriber', label: 'suscriptor' },
          { value: 'moderator', label: 'moderador' },
        ],
      },
    ],
  },
  {
    type: 'keyword',
    label: 'Palabra clave en el comentario',
    help: 'Por ejemplo, un comando como !di o !baile.',
    appliesTo: ['comment'],
    params: [
      {
        key: 'match',
        label: 'Cómo',
        kind: 'select',
        default: 'startsWith',
        options: [
          { value: 'startsWith', label: 'empieza con' },
          { value: 'contains', label: 'contiene' },
          { value: 'equals', label: 'es exactamente' },
          { value: 'regex', label: 'expresión regular' },
        ],
      },
      { key: 'value', label: 'Texto', kind: 'text', default: '!' },
      { key: 'caseSensitive', label: 'Distinguir mayúsculas', kind: 'boolean', default: false },
    ],
  },
  {
    type: 'firstTime',
    label: 'Primera vez en el live',
    help: 'Primer regalo o comentario del usuario en esta sesión.',
    appliesTo: ['gift', 'comment'],
    params: [],
  },
];

/** UI description of every action type, mirroring ActionHandlerRegistry on the server. */
export const ACTION_TYPES: readonly TypeDef[] = [
  {
    type: 'playSound',
    label: 'Reproducir sonido',
    help: 'Suena en la pestaña de audio de la PC de stream.',
    params: [
      { key: 'assetId', label: 'Sonido', kind: 'sound', default: null },
      { key: 'volume', label: 'Volumen', kind: 'percent', default: 0.8 },
      {
        key: 'maxMs',
        label: 'Duración máxima (s, opcional)',
        kind: 'seconds',
        default: null,
        optional: true,
      },
      {
        key: 'screen',
        label: 'Pantalla',
        kind: 'text',
        default: 'audio',
        help: 'Normalmente «audio».',
      },
    ],
  },
  {
    type: 'showAlert',
    label: 'Mostrar alerta',
    help: 'Texto (y opcionalmente imagen o GIF) en el overlay de alertas.',
    params: [
      {
        key: 'text',
        label: 'Texto',
        kind: 'text',
        default: '{nickname} envió {quantity} {giftName}',
      },
      { key: 'assetId', label: 'Imagen (opcional)', kind: 'visual', default: null, optional: true },
      { key: 'durationMs', label: 'Duración (s)', kind: 'seconds', default: 5000 },
      {
        key: 'screen',
        label: 'Pantalla',
        kind: 'text',
        default: 'alerts',
        help: 'Normalmente «alerts».',
      },
    ],
  },
  {
    type: 'speak',
    label: 'Leer en voz alta',
    help: 'Texto a voz en la pestaña de audio; {comment} y {commandArgs} pasan por la moderación.',
    params: [
      { key: 'text', label: 'Texto', kind: 'text', default: 'Gracias {nickname}' },
      {
        key: 'voice',
        label: 'Voz o idioma (opcional)',
        kind: 'text',
        default: '',
        optional: true,
        help: 'Ej.: es-MX',
      },
      { key: 'volume', label: 'Volumen', kind: 'percent', default: 1 },
      {
        key: 'screen',
        label: 'Pantalla',
        kind: 'text',
        default: 'audio',
        help: 'Normalmente «audio».',
      },
    ],
  },
];

export const TEMPLATE_VARIABLES: Readonly<Partial<Record<LiveEventType, readonly string[]>>> = {
  gift: ['{nickname}', '{uniqueId}', '{giftName}', '{quantity}', '{diamonds}'],
  comment: ['{nickname}', '{uniqueId}', '{comment}', '{commandArgs}'],
  like: ['{nickname}', '{uniqueId}', '{likes}', '{totalLikes}'],
  follow: ['{nickname}', '{uniqueId}'],
  join: ['{nickname}', '{uniqueId}'],
  share: ['{nickname}', '{uniqueId}'],
  viewerCount: ['{viewerCount}'],
};

export function typeDef(list: readonly TypeDef[], type: string): TypeDef | undefined {
  return list.find((t) => t.type === type);
}

function optionLabel(def: TypeDef | undefined, key: string, value: unknown): string {
  return (
    def?.params.find((p) => p.key === key)?.options?.find((o) => o.value === value)?.label ??
    String(value)
  );
}

/** One-line description for the rule list. */
export function describeCondition(c: ConditionConfig): string {
  const def = typeDef(CONDITION_TYPES, c.type);
  const label = def?.label ?? c.type;
  if ('op' in c) return `${label} ${optionLabel(def, 'op', c.op)} ${String(c.value)}`;
  if (c.type === 'likesCumulative')
    return `${label}: ${optionLabel(def, 'mode', c.mode)} ${c.value}`;
  if (c.type === 'userRole') return `${label}: ${optionLabel(def, 'role', c.role)}`;
  if (c.type === 'keyword') return `Comentario ${optionLabel(def, 'match', c.match)} «${c.value}»`;
  return label;
}

export function describeAction(
  a: ActionConfig,
  assetName: (id: number | undefined) => string,
): string {
  if (a.type === 'playSound') return `Sonido: ${assetName(a.assetId)}`;
  if (a.type === 'showAlert') return `Alerta: ${a.text}`;
  return `Voz: ${a.text}`;
}

/** Screens a rule writes to, for the collision warning. */
export function screensOf(rule: Pick<Rule, 'actions'>): Set<string> {
  return new Set(rule.actions.map((a) => a.screen));
}

/**
 * Spec 13: warn when two enabled rules can fire on the same event, on the same screen, with the
 * same priority (their order then depends only on creation order).
 */
export function collisions(rule: Rule, all: readonly Rule[]): Rule[] {
  if (!rule.enabled) return [];
  const screens = screensOf(rule);
  return all.filter(
    (other) =>
      other.id !== rule.id &&
      other.enabled &&
      other.trigger === rule.trigger &&
      other.priority === rule.priority &&
      [...screensOf(other)].some((s) => screens.has(s)),
  );
}
