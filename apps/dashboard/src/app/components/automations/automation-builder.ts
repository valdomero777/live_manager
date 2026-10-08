import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideListFilter, LucideRadio, LucideZap } from '@lucide/angular';
import type { LiveEventType } from '@tiklive/contracts';
import { UiBadge } from '../ui/badge';
import { ActionBuilder } from './action-builder';
import { AutomationStep } from './automation-step';
import { ConditionBuilder } from './condition-builder';
import type { TypeDef } from './rule-catalog';
import type { ItemDraft } from './rule-draft';
import type { RuleOp } from './rule-ops';
import { TriggerSelector } from './trigger-selector';

/**
 * Event → Conditions → Actions[] as a vertical flow: WHEN (trigger), IF (all conditions), THEN
 * (actions in order). Presentational: every edit is emitted as a RuleOp.
 */
@Component({
  selector: 'app-automation-builder',
  imports: [AutomationStep, TriggerSelector, ConditionBuilder, ActionBuilder, UiBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-automation-step
      kind="when"
      title="Ocurre este evento en tu LIVE"
      [icon]="icons.when"
    >
      <app-trigger-selector
        name="rule-trigger"
        [value]="trigger()"
        (valueChange)="op.emit({ kind: 'trigger', trigger: $event })"
      />
    </app-automation-step>

    <app-automation-step
      kind="if"
      title="Se cumplen estas condiciones"
      [icon]="icons.if"
    >
      @if (conditions().length) {
        <span stepAction uiBadge variant="info">{{ conditions().length }} · todas deben cumplirse</span>
      }
      <app-condition-builder
        [items]="conditions()"
        [types]="conditionTypes()"
        (op)="op.emit($event)"
      />
    </app-automation-step>

    <app-automation-step
      kind="then"
      title="Ejecutar estas acciones"
      [icon]="icons.then"
      [last]="true"
    >
      <span stepAction uiBadge variant="automation">{{ modeLabel() }}</span>
      <app-action-builder
        [items]="actions()"
        [types]="actionTypes()"
        [variables]="variables()"
        (op)="op.emit($event)"
      />
    </app-automation-step>
  `,
})
export class AutomationBuilder {
  readonly trigger = input.required<LiveEventType>();
  readonly conditions = input.required<readonly ItemDraft[]>();
  readonly actions = input.required<readonly ItemDraft[]>();
  readonly conditionTypes = input.required<readonly TypeDef[]>();
  readonly actionTypes = input.required<readonly TypeDef[]>();
  readonly variables = input<readonly string[]>([]);
  readonly mode = input<'all' | 'random'>('all');
  readonly op = output<RuleOp>();

  protected readonly icons = { when: LucideRadio, if: LucideListFilter, then: LucideZap };
  protected readonly modeLabel = computed(() => {
    const n = this.actions().length;
    if (this.mode() === 'random' && n > 1) return `1 de ${n} al azar`;
    return n === 1 ? '1 acción' : `${n} acciones en orden`;
  });
}
