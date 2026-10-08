import type { GiftInfo, LiveEventType } from '@tiklive/contracts';
import type { ParamDef } from './rule-catalog';

export type RuleList = 'conditions' | 'actions';

/**
 * Every edit the automation builder can ask for. The builder is presentational: it emits these
 * and the page applies them to its draft (the only place that holds rule state).
 */
export type RuleOp =
  | { readonly kind: 'trigger'; readonly trigger: LiveEventType }
  | { readonly kind: 'add'; readonly list: RuleList; readonly type: string }
  | { readonly kind: 'remove'; readonly list: RuleList; readonly index: number }
  | { readonly kind: 'move'; readonly list: RuleList; readonly index: number; readonly delta: number }
  | { readonly kind: 'type'; readonly list: RuleList; readonly index: number; readonly type: string }
  | {
      readonly kind: 'param';
      readonly list: RuleList;
      readonly index: number;
      readonly param: ParamDef;
      readonly raw: string | boolean;
    }
  | { readonly kind: 'gift'; readonly index: number; readonly gift: GiftInfo };

/** What an item editor emits; the list and index are added by its parent builder. */
export type ItemOp =
  | { readonly kind: 'remove' }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'type'; readonly type: string }
  | { readonly kind: 'param'; readonly param: ParamDef; readonly raw: string | boolean }
  | { readonly kind: 'gift'; readonly gift: GiftInfo };

export function toRuleOp(list: RuleList, index: number, op: ItemOp): RuleOp {
  if (op.kind === 'gift') return { kind: 'gift', index, gift: op.gift };
  return { ...op, list, index };
}
