import type { ConditionConfig, GiftEvent, LiveEvent, NumericOp } from '@tiklive/contracts';
import { ConditionRegistry, type Condition, type EvaluationContext } from './condition.js';
import { compileSafeRegex, testBounded } from './safe-regex.js';

type Config<K extends ConditionConfig['type']> = Extract<ConditionConfig, { type: K }>;

export function compareNumber(op: NumericOp, actual: number, expected: number): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'gte':
      return actual >= expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'lt':
      return actual < expected;
  }
}

function asGift(event: LiveEvent): GiftEvent | undefined {
  return event.type === 'gift' ? event : undefined;
}

function giftCondition(type: string, test: (gift: GiftEvent) => boolean): Condition {
  return {
    type,
    isSatisfiedBy: (event) => {
      const gift = asGift(event);
      return gift !== undefined && test(gift);
    },
  };
}

export function giftNameCondition(cfg: Config<'giftName'>): Condition {
  const expected = cfg.value.toLowerCase();
  return giftCondition(cfg.type, (gift) => {
    const name = gift.giftName.toLowerCase();
    if (cfg.op === 'contains') return name.includes(expected);
    return (name === expected) === (cfg.op === 'eq');
  });
}

export function giftIdCondition(cfg: Config<'giftId'>): Condition {
  return giftCondition(cfg.type, (gift) => (gift.giftId === cfg.value) === (cfg.op === 'eq'));
}

export function diamondsTotalCondition(cfg: Config<'diamondsTotal'>): Condition {
  return giftCondition(cfg.type, (gift) =>
    compareNumber(cfg.op, gift.diamondValue * gift.quantity, cfg.value),
  );
}

export function quantityCondition(cfg: Config<'quantity'>): Condition {
  return giftCondition(cfg.type, (gift) => compareNumber(cfg.op, gift.quantity, cfg.value));
}

export function likesCumulativeCondition(cfg: Config<'likesCumulative'>): Condition {
  return {
    type: cfg.type,
    isSatisfiedBy: (event, ctx: EvaluationContext) => {
      if (event.type !== 'like') return false;
      if (cfg.mode === 'threshold')
        return ctx.likesBefore < cfg.value && ctx.likesAfter >= cfg.value;
      return Math.floor(ctx.likesAfter / cfg.value) > Math.floor(ctx.likesBefore / cfg.value);
    },
  };
}

export function userRoleCondition(cfg: Config<'userRole'>): Condition {
  return {
    type: cfg.type,
    isSatisfiedBy: (event) => {
      if (!('viewer' in event)) return false;
      const { viewer } = event;
      if (cfg.role === 'follower') return viewer.isFollower;
      if (cfg.role === 'subscriber') return viewer.isSubscriber;
      return viewer.isModerator;
    },
  };
}

function keywordMatcher(cfg: Config<'keyword'>): (text: string) => boolean {
  if (cfg.match === 'regex') {
    const regex = compileSafeRegex(cfg.value, cfg.caseSensitive);
    return (text) => testBounded(regex, text);
  }
  const normalize = (s: string) => (cfg.caseSensitive ? s : s.toLowerCase());
  const needle = normalize(cfg.value);
  if (cfg.match === 'startsWith') return (text) => normalize(text).trimStart().startsWith(needle);
  if (cfg.match === 'equals') return (text) => normalize(text).trim() === needle;
  return (text) => normalize(text).includes(needle);
}

export function keywordCondition(cfg: Config<'keyword'>): Condition {
  const matches = keywordMatcher(cfg);
  return {
    type: cfg.type,
    isSatisfiedBy: (event) => event.type === 'comment' && matches(event.text),
  };
}

export function firstTimeCondition(cfg: Config<'firstTime'>): Condition {
  return { type: cfg.type, isSatisfiedBy: (_event, ctx) => ctx.isFirstInteraction };
}

export function createDefaultConditionRegistry(): ConditionRegistry {
  return new ConditionRegistry()
    .register('giftName', giftNameCondition)
    .register('giftId', giftIdCondition)
    .register('diamondsTotal', diamondsTotalCondition)
    .register('quantity', quantityCondition)
    .register('likesCumulative', likesCumulativeCondition)
    .register('userRole', userRoleCondition)
    .register('keyword', keywordCondition)
    .register('firstTime', firstTimeCondition);
}
