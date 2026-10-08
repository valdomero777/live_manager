import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucidePlus } from '@lucide/angular';
import { EmptyState } from '../shared/empty-state';
import { UiBadge } from '../ui/badge';
import { UiButton } from '../ui/button';
import { UI_DROPDOWN_MENU } from '../ui/dropdown-menu';
import { ACTION_KINDS } from './automation-meta';
import type { TypeDef } from './rule-catalog';
import type { ItemDraft } from './rule-draft';
import { RuleItemEditor } from './rule-item-editor';
import { toRuleOp, type RuleOp } from './rule-ops';

/**
 * THEN: the list of actions (Actions[]), in order. Built for many action kinds: today sound, voice
 * and overlay alerts; Webhook and OBS are shown as upcoming.
 */
@Component({
  selector: 'app-action-builder',
  imports: [
    RuleItemEditor,
    EmptyState,
    UiBadge,
    UiButton,
    ...UI_DROPDOWN_MENU,
    LucidePlus,
    LucideDynamicIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-3' },
  template: `
    @for (item of items(); track $index; let i = $index) {
      <app-rule-item-editor
        kind="action"
        [item]="item"
        [types]="types()"
        [index]="i"
        [total]="items().length"
        (op)="op.emit(toRuleOp('actions', i, $event))"
      />
    } @empty {
      <app-empty-state
        title="Sin acciones"
        description="Agrega al menos una: reproducir un sonido, leer en voz alta o mostrar una alerta."
        class="py-6"
      />
    }

    <div class="flex flex-wrap items-center gap-3">
      <button uiButton variant="outline" size="sm" type="button" [cdkMenuTriggerFor]="menu">
        <svg lucidePlus /> Añadir acción
      </button>
      @if (variables().length) {
        <p class="type-caption">
          Variables para textos:
          @for (v of variables(); track v) {
            <code class="mx-0.5 rounded bg-muted px-1 py-0.5 text-[0.6875rem] text-foreground">{{ v }}</code>
          }
        </p>
      }
    </div>
    <ng-template #menu>
      <div cdkMenu uiDropdownMenu class="w-72">
        @for (k of kinds(); track k.label) {
          <button
            cdkMenuItem
            uiDropdownMenuItem
            [disabled]="!k.available"
            (cdkMenuItemTriggered)="k.type && op.emit({ kind: 'add', list: 'actions', type: k.type })"
          >
            <span [class]="k.tone" class="grid size-7 shrink-0 place-items-center rounded-md">
              <svg [lucideIcon]="k.icon" class="size-3.5 !text-current" />
            </span>
            <span class="grid flex-1">
              <span class="font-medium">{{ k.label }}</span>
              <span class="type-caption">{{ k.description }}</span>
            </span>
            @if (!k.available) {
              <span uiBadge variant="outline">Próximamente</span>
            }
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class ActionBuilder {
  readonly items = input.required<readonly ItemDraft[]>();
  readonly types = input.required<readonly TypeDef[]>();
  readonly variables = input<readonly string[]>([]);
  readonly op = output<RuleOp>();
  protected readonly toRuleOp = toRuleOp;

  protected readonly kinds = computed(() => {
    const supported = new Set(this.types().map((t) => t.type));
    return ACTION_KINDS.map((k) => ({ ...k, available: !!k.type && supported.has(k.type) }));
  });
}
