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
  /** Stored with the item but not shown as a field: another control fills it (the sound picker). */
  readonly hidden?: boolean;
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
  { value: 'gte', label: $localize`al menos (≥)` },
  { value: 'eq', label: $localize`igual a (=)` },
  { value: 'lte', label: $localize`como máximo (≤)` },
  { value: 'gt', label: $localize`más de (>)` },
  { value: 'lt', label: $localize`menos de (<)` },
];

/**
 * UI description of every condition type. Adding a condition = one entry here (the editor
 * renders it generically), mirroring ConditionRegistry on the server.
 */
export const CONDITION_TYPES: readonly TypeDef[] = [
  {
    type: 'giftName',
    label: $localize`Nombre del regalo`,
    help: $localize`Compara el nombre del regalo, sin distinguir mayúsculas.`,
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: $localize`Comparación`,
        kind: 'select',
        default: 'eq',
        options: [
          { value: 'eq', label: $localize`es` },
          { value: 'neq', label: $localize`no es` },
          { value: 'contains', label: 'contiene' },
        ],
      },
      { key: 'value', label: $localize`Regalo`, kind: 'text', default: 'Rose' },
    ],
  },
  {
    type: 'giftId',
    label: $localize`ID del regalo`,
    help: $localize`Útil si el nombre cambia según el idioma.`,
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: $localize`Comparación`,
        kind: 'select',
        default: 'eq',
        options: [
          { value: 'eq', label: $localize`es` },
          { value: 'neq', label: $localize`no es` },
        ],
      },
      { key: 'value', label: 'ID', kind: 'number', default: 5655 },
    ],
  },
  {
    type: 'diamondsTotal',
    label: $localize`Diamantes del regalo`,
    help: $localize`Diamantes por unidad × cantidad de la racha.`,
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: $localize`Comparación`,
        kind: 'select',
        default: 'gte',
        options: NUMERIC_OPS,
      },
      { key: 'value', label: $localize`Diamantes`, kind: 'number', default: 100 },
    ],
  },
  {
    type: 'quantity',
    label: $localize`Cantidad del regalo`,
    help: $localize`Cantidad total de la racha consolidada.`,
    appliesTo: ['gift'],
    params: [
      {
        key: 'op',
        label: $localize`Comparación`,
        kind: 'select',
        default: 'gte',
        options: NUMERIC_OPS,
      },
      { key: 'value', label: $localize`Cantidad`, kind: 'number', default: 10 },
    ],
  },
  {
    type: 'likesCumulative',
    label: $localize`Likes acumulados del usuario`,
    help: $localize`Likes del usuario en este live.`,
    appliesTo: ['like'],
    params: [
      {
        key: 'mode',
        label: $localize`Cuándo`,
        kind: 'select',
        default: 'every',
        options: [
          { value: 'every', label: $localize`cada vez que suma` },
          { value: 'threshold', label: $localize`una vez al llegar a` },
        ],
      },
      { key: 'value', label: $localize`Likes`, kind: 'number', default: 100 },
    ],
  },
  {
    type: 'userRole',
    label: $localize`Tipo de usuario`,
    help: $localize`Solo para seguidores, suscriptores o moderadores.`,
    params: [
      {
        key: 'role',
        label: $localize`Debe ser`,
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
    label: $localize`Palabra clave en el comentario`,
    help: $localize`Por ejemplo, un comando como !di o !baile.`,
    appliesTo: ['comment'],
    params: [
      {
        key: 'match',
        label: $localize`Cómo`,
        kind: 'select',
        default: 'startsWith',
        options: [
          { value: 'startsWith', label: $localize`empieza con` },
          { value: 'contains', label: 'contiene' },
          { value: 'equals', label: $localize`es exactamente` },
          { value: 'regex', label: $localize`expresión regular` },
        ],
      },
      { key: 'value', label: $localize`Texto`, kind: 'text', default: '!' },
      {
        key: 'caseSensitive',
        label: $localize`Distinguir mayúsculas`,
        kind: 'boolean',
        default: false,
      },
    ],
  },
  {
    type: 'firstTime',
    label: $localize`Primera vez en el live`,
    help: $localize`Primer regalo o comentario del usuario en esta sesión.`,
    appliesTo: ['gift', 'comment'],
    params: [],
  },
];

/** UI description of every action type, mirroring ActionHandlerRegistry on the server. */
export const ACTION_TYPES: readonly TypeDef[] = [
  {
    type: 'playSound',
    label: $localize`Reproducir sonido`,
    help: $localize`Suena en la pestaña de audio de la PC de stream.`,
    params: [
      // «Sonido» is the picker (library, MyInstants or Freesound); it fills assetId or the
      // soundUrl group, never both.
      { key: 'assetId', label: $localize`Sonido`, kind: 'sound', default: null, optional: true },
      {
        key: 'soundUrl',
        label: 'soundUrl',
        kind: 'text',
        default: null,
        optional: true,
        hidden: true,
      },
      {
        key: 'soundPageUrl',
        label: 'soundPageUrl',
        kind: 'text',
        default: null,
        optional: true,
        hidden: true,
      },
      {
        key: 'soundTitle',
        label: 'soundTitle',
        kind: 'text',
        default: null,
        optional: true,
        hidden: true,
      },
      {
        key: 'soundSource',
        label: 'soundSource',
        kind: 'text',
        default: null,
        optional: true,
        hidden: true,
      },
      { key: 'volume', label: $localize`Volumen`, kind: 'percent', default: 0.8 },
      {
        key: 'maxMs',
        label: $localize`Duración máxima (s, opcional)`,
        kind: 'seconds',
        default: null,
        optional: true,
      },
      {
        key: 'screen',
        label: $localize`Pantalla`,
        kind: 'text',
        default: 'audio',
        help: $localize`Normalmente «audio».`,
      },
    ],
  },
  {
    type: 'showAlert',
    label: $localize`Mostrar alerta`,
    help: $localize`Texto (y opcionalmente imagen o GIF) en el overlay de alertas.`,
    params: [
      {
        key: 'text',
        label: $localize`Texto`,
        kind: 'text',
        default: '{nickname} envió {quantity} {giftName}',
      },
      {
        key: 'assetId',
        label: $localize`Imagen (opcional)`,
        kind: 'visual',
        default: null,
        optional: true,
      },
      { key: 'durationMs', label: $localize`Duración (s)`, kind: 'seconds', default: 5000 },
      {
        key: 'screen',
        label: $localize`Pantalla`,
        kind: 'text',
        default: 'alerts',
        help: $localize`Normalmente «alerts».`,
      },
    ],
  },
  {
    type: 'speak',
    label: $localize`Leer en voz alta`,
    help: $localize`Texto a voz en la pestaña de audio; {comment} y {commandArgs} pasan por la moderación.`,
    params: [
      { key: 'text', label: $localize`Texto`, kind: 'text', default: 'Gracias {nickname}' },
      {
        key: 'voice',
        label: $localize`Voz o idioma (opcional)`,
        kind: 'text',
        default: '',
        optional: true,
        help: 'Ej.: es-MX',
      },
      { key: 'volume', label: $localize`Volumen`, kind: 'percent', default: 1 },
      {
        key: 'screen',
        label: $localize`Pantalla`,
        kind: 'text',
        default: 'audio',
        help: $localize`Normalmente «audio».`,
      },
    ],
  },
  {
    type: 'updateGoal',
    label: $localize`Sumar a una meta`,
    help: $localize`Suma progreso manual a una meta (negativo para restar). Cuenta como progreso ganado.`,
    params: [
      { key: 'goalId', label: $localize`ID de la meta`, kind: 'number', default: 1 },
      { key: 'amount', label: $localize`Cantidad`, kind: 'number', default: 1 },
    ],
  },
  {
    type: 'webhook',
    label: $localize`Llamar a un webhook`,
    help:
      $localize`Envía JSON a una URL. El host debe estar en WEBHOOK_ALLOWED_HOSTS del servidor; ` +
      $localize`{comment} y {commandArgs} pasan por la moderación.`,
    params: [
      { key: 'url', label: 'URL', kind: 'text', default: 'https://' },
      {
        key: 'method',
        label: $localize`Método`,
        kind: 'select',
        default: 'POST',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
        ],
      },
      {
        key: 'body',
        label: $localize`Cuerpo JSON`,
        kind: 'text',
        default: '{"user":"{nickname}"}',
        help: $localize`Las variables se escapan solas dentro de las comillas.`,
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
  if (c.type === 'keyword')
    return $localize`Comentario ${optionLabel(def, 'match', c.match)} «${c.value}»`;
  return label;
}

export function describeAction(
  a: ActionConfig,
  assetName: (id: number | undefined) => string,
): string {
  if (a.type === 'playSound') return $localize`Sonido: ${a.soundTitle ?? assetName(a.assetId)}`;
  if (a.type === 'showAlert') return $localize`Alerta: ${a.text}`;
  if (a.type === 'updateGoal')
    return $localize`Meta #${a.goalId}\: ${a.amount > 0 ? '+' : ''}${a.amount}`;
  if (a.type === 'webhook')
    return $localize`Webhook: ${URL.canParse(a.url) ? new URL(a.url).host : a.url}`;
  return $localize`Voz: ${a.text}`;
}

/** Screens a rule writes to, for the collision warning. */
export function screensOf(rule: Pick<Rule, 'actions'>): Set<string> {
  return new Set(rule.actions.flatMap((a) => ('screen' in a ? [a.screen] : [])));
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
