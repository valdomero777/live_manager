import {
  MAX_GUIDE_ENTRIES,
  type ActionConfig,
  type ConditionConfig,
  type GiftInfo,
  type GuideAction,
  type GuideEntry,
  type Rule,
} from '@tiklive/contracts';

const MAX_TEXT = 120;

/** Viewer placeholders ("{user}") have no value in a guide, so they become an ellipsis. */
function cleanText(text: string): string | undefined {
  const cleaned = text
    .replace(/\{[^}]*\}/g, '…')
    .trim()
    .slice(0, MAX_TEXT);
  return cleaned === '' ? undefined : cleaned;
}

function toGuideAction(action: ActionConfig): GuideAction | undefined {
  if (action.type === 'playSound') return { kind: 'sound' };
  if (action.type !== 'speak' && action.type !== 'showAlert') return undefined;
  const text = cleanText(action.text);
  return { kind: action.type === 'speak' ? 'speech' : 'alert', ...(text ? { text } : {}) };
}

interface GiftTarget {
  readonly giftId?: number;
  readonly giftName?: string;
}

/** A rule is a guide entry only when it names one exact gift (by id or by name). */
function targetOf(conditions: readonly ConditionConfig[]): GiftTarget | undefined {
  let target: GiftTarget = {};
  for (const c of conditions) {
    if (c.type === 'giftId' && c.op === 'eq') target = { ...target, giftId: c.value };
    if (c.type === 'giftName' && c.op === 'eq') target = { ...target, giftName: c.value };
  }
  return target.giftId === undefined && target.giftName === undefined ? undefined : target;
}

function isIdentity(c: ConditionConfig): boolean {
  return (c.type === 'giftId' || c.type === 'giftName') && c.op === 'eq';
}

interface Accumulator {
  target: GiftTarget;
  actions: GuideAction[];
  conditional: boolean;
}

function addActions(into: GuideAction[], actions: readonly GuideAction[]): void {
  for (const a of actions) {
    if (!into.some((x) => x.kind === a.kind && x.text === a.text)) into.push(a);
  }
}

function resolve(target: GiftTarget, gifts: readonly GiftInfo[]): GiftInfo | undefined {
  if (target.giftId !== undefined) return gifts.find((g) => g.id === target.giftId);
  const name = target.giftName?.toLowerCase();
  return gifts.find((g) => g.name.toLowerCase() === name);
}

function toEntry(acc: Accumulator, gifts: readonly GiftInfo[]): GuideEntry {
  const info = resolve(acc.target, gifts);
  const giftId = acc.target.giftId ?? info?.id;
  const giftName = info?.name ?? acc.target.giftName ?? `#${String(giftId)}`;
  return {
    ...(giftId !== undefined ? { giftId } : {}),
    giftName,
    ...(info?.imageUrl ? { imageUrl: info.imageUrl } : {}),
    ...(info ? { diamonds: info.diamonds } : {}),
    conditional: acc.conditional,
    actions: acc.actions,
  };
}

/**
 * What the audience can trigger with each gift, read from the enabled rules that react to one
 * exact gift. Rules for "any gift", contains/not-equal matches and server-only actions (goals,
 * webhooks) are left out: the guide never promises a reaction that is not configured. The
 * catalog only adds the image and price; without it the guide still lists the gifts by name.
 */
export function buildGiftGuide(
  rules: readonly Rule[],
  gifts: readonly GiftInfo[] = [],
): GuideEntry[] {
  return [...collect(rules, gifts).values()]
    .map((acc) => toEntry(acc, gifts))
    .sort(byPriceThenName)
    .slice(0, MAX_GUIDE_ENTRIES);
}

function collect(rules: readonly Rule[], gifts: readonly GiftInfo[]): Map<string, Accumulator> {
  const byKey = new Map<string, Accumulator>();
  for (const rule of rules) {
    const found = ruleEntry(rule);
    if (!found) continue;
    const info = resolve(found.target, gifts);
    const { giftId, giftName } = found.target;
    const key = String(info?.id ?? giftId ?? giftName?.toLowerCase());
    const acc = byKey.get(key) ?? { ...found, actions: [] };
    acc.conditional = acc.conditional && found.conditional;
    addActions(acc.actions, found.actions);
    byKey.set(key, acc);
  }
  return byKey;
}

/** The gift an enabled gift rule is about and what it does, if it says something to the audience. */
function ruleEntry(rule: Rule): Accumulator | undefined {
  if (!rule.enabled || rule.trigger !== 'gift') return undefined;
  const target = targetOf(rule.conditions);
  const actions = rule.actions.flatMap((a) => toGuideAction(a) ?? []);
  if (!target || actions.length === 0) return undefined;
  return { target, actions, conditional: rule.conditions.some((c) => !isIdentity(c)) };
}

function byPriceThenName(a: GuideEntry, b: GuideEntry): number {
  const price = (e: GuideEntry) => e.diamonds ?? Number.MAX_SAFE_INTEGER;
  return price(a) - price(b) || a.giftName.localeCompare(b.giftName);
}
