import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideInfinity, LucidePlus } from '@lucide/angular';
import { UiButton } from '../ui/button';
import { UI_DROPDOWN_MENU } from '../ui/dropdown-menu';
import type { TypeDef } from './rule-catalog';
import type { ItemDraft } from './rule-draft';
import { RuleItemEditor } from './rule-item-editor';
import { toRuleOp, type RuleOp } from './rule-ops';

/** IF: conditions that must all hold. None means "every event of this type". */
@Component({
  selector: 'app-condition-builder',
  imports: [RuleItemEditor, UiButton, ...UI_DROPDOWN_MENU, LucidePlus, LucideInfinity],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-3' },
  template: `
    @for (item of items(); track $index; let i = $index) {
      @if (i > 0) {
        <span class="-my-1 justify-self-start rounded-full bg-muted px-2 py-0.5 type-overline text-muted-foreground">
          y además
        </span>
      }
      <app-rule-item-editor
        kind="condition"
        [item]="item"
        [types]="types()"
        [index]="i"
        [total]="items().length"
        (op)="op.emit(toRuleOp('conditions', i, $event))"
      />
    } @empty {
      <div class="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3">
        <svg lucideInfinity class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p class="type-secondary">
          <span class="font-medium text-foreground">Siempre.</span>
          Sin condiciones, la automatización se ejecuta con cada evento de este tipo.
        </p>
      </div>
    }

    <div>
      <button uiButton variant="outline" size="sm" type="button" [cdkMenuTriggerFor]="menu">
        <svg lucidePlus /> Añadir condición
      </button>
    </div>
    <ng-template #menu>
      <div cdkMenu uiDropdownMenu class="w-72">
        @for (t of types(); track t.type) {
          <button
            cdkMenuItem
            uiDropdownMenuItem
            class="flex-col items-start gap-0.5"
            (cdkMenuItemTriggered)="op.emit({ kind: 'add', list: 'conditions', type: t.type })"
          >
            <span class="font-medium">{{ t.label }}</span>
            <span class="type-caption whitespace-normal">{{ t.help }}</span>
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class ConditionBuilder {
  readonly items = input.required<readonly ItemDraft[]>();
  /** Condition types that apply to the chosen trigger. */
  readonly types = input.required<readonly TypeDef[]>();
  readonly op = output<RuleOp>();
  protected readonly toRuleOp = toRuleOp;
}
