import {
  RuleDefinitionSchema,
  type LiveEventType,
  type Rule,
  type RuleDefinition,
} from '@tiklive/contracts';
import {
  ACTION_TYPES,
  CONDITION_TYPES,
  typeDef,
  type ParamDef,
  type TypeDef,
} from './rule-catalog';

export type ParamValue = string | number | boolean | null;

export interface ItemDraft {
  readonly type: string;
  readonly params: Readonly<Record<string, ParamValue>>;
}

/** Editor model: what the form shows (seconds and percentages instead of ms and fractions). */
export interface RuleDraft {
  readonly name: string;
  readonly trigger: LiveEventType;
  readonly mode: 'all' | 'random';
  readonly priority: number;
  readonly cooldownS: number;
  readonly userCooldownS: number;
  readonly probabilityPct: number;
  readonly enabled: boolean;
  readonly conditions: readonly ItemDraft[];
  readonly actions: readonly ItemDraft[];
}

export const EMPTY_DRAFT: RuleDraft = {
  name: '',
  trigger: 'gift',
  mode: 'all',
  priority: 50,
  cooldownS: 0,
  userCooldownS: 0,
  probabilityPct: 100,
  enabled: true,
  conditions: [],
  actions: [newItem(ACTION_TYPES, 'showAlert')],
};

/** Catalog defaults are in stored units (ms, fractions); convert them like a loaded rule. */
export function newItem(list: readonly TypeDef[], type: string): ItemDraft {
  const def = typeDef(list, type);
  return {
    type,
    params: Object.fromEntries((def?.params ?? []).map((p) => [p.key, toDisplay(p, p.default)])),
  };
}

function toDisplay(p: ParamDef, raw: unknown): ParamValue {
  if (raw === undefined || raw === null) return p.optional ? null : p.default;
  if (p.kind === 'seconds' && typeof raw === 'number') return raw / 1000;
  return raw as ParamValue;
}

function fromDisplay(p: ParamDef, value: ParamValue): unknown {
  if (value === null || value === '') return undefined;
  if (p.kind === 'seconds') return Math.round(Number(value) * 1000);
  if (p.kind === 'number' || p.kind === 'percent' || p.kind === 'sound' || p.kind === 'visual') {
    return Number(value);
  }
  return value;
}

function itemFromConfig(list: readonly TypeDef[], config: { type: string } & object): ItemDraft {
  const def = typeDef(list, config.type);
  const record = config as Record<string, unknown>;
  const params = Object.fromEntries(
    (def?.params ?? []).map((p) => [p.key, toDisplay(p, record[p.key])]),
  );
  return { type: config.type, params };
}

function itemToConfig(list: readonly TypeDef[], item: ItemDraft): Record<string, unknown> {
  const def = typeDef(list, item.type);
  const out: Record<string, unknown> = { type: item.type };
  for (const p of def?.params ?? []) {
    const value = fromDisplay(p, item.params[p.key] ?? null);
    if (value !== undefined) out[p.key] = value;
  }
  return out;
}

export function draftFromRule(rule: Rule): RuleDraft {
  return {
    name: rule.name,
    trigger: rule.trigger,
    mode: rule.mode,
    priority: rule.priority,
    cooldownS: rule.cooldownMs / 1000,
    userCooldownS: rule.userCooldownMs / 1000,
    probabilityPct: Math.round(rule.probability * 100),
    enabled: rule.enabled,
    conditions: rule.conditions.map((c) => itemFromConfig(CONDITION_TYPES, c)),
    actions: rule.actions.map((a) => itemFromConfig(ACTION_TYPES, a)),
  };
}

export interface DraftValidation {
  readonly definition?: RuleDefinition;
  readonly errors: readonly string[];
}

const PATH_LABELS: Readonly<Record<string, string>> = {
  name: 'Nombre',
  conditions: 'Condición',
  actions: 'Acción',
  priority: 'Prioridad',
  probability: 'Probabilidad',
};

/** Converts the editor model and validates it with the same schema the server uses. */
export function validateDraft(d: RuleDraft): DraftValidation {
  const candidate = {
    name: d.name.trim(),
    trigger: d.trigger,
    mode: d.mode,
    priority: Number(d.priority),
    cooldownMs: Math.round(Number(d.cooldownS) * 1000),
    userCooldownMs: Math.round(Number(d.userCooldownS) * 1000),
    probability: Number(d.probabilityPct) / 100,
    enabled: d.enabled,
    conditions: d.conditions.map((c) => itemToConfig(CONDITION_TYPES, c)),
    actions: d.actions.map((a) => itemToConfig(ACTION_TYPES, a)),
  };
  const result = RuleDefinitionSchema.safeParse(candidate);
  if (result.success) return { definition: result.data, errors: [] };
  return {
    errors: result.error.issues.map((issue) => {
      const [head, index, field] = issue.path;
      const where = PATH_LABELS[String(head)] ?? String(head);
      const position = typeof index === 'number' ? ` ${index + 1}` : '';
      const detail = field === undefined ? '' : ` (${String(field)})`;
      return `${where}${position}${detail}: ${issue.message}`;
    }),
  };
}
