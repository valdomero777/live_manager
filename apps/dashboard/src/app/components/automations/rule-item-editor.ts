import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideTrash,
} from '@lucide/angular';
import { AssetsStore } from '../../core/assets.store';
import { GiftGrid } from '../shared/gift-grid/gift-grid';
import { UiButton } from '../ui/button';
import { UiFormField, describedBy } from '../ui/form-field';
import { UiInput, UiNativeSelect, UiSlider } from '../ui/input';
import { UiSwitch } from '../ui/switch';
import { UiTooltip } from '../ui/tooltip';
import { SoundPreview } from '../sounds/sound-preview';
import { CONDITION_ICON, actionKind } from './automation-meta';
import type { ParamDef, TypeDef } from './rule-catalog';
import type { ItemDraft } from './rule-draft';
import type { ItemOp } from './rule-ops';

/** What the form shows for a stored param value (percentages as 0–100). */
export function displayParam(item: ItemDraft, param: ParamDef): string {
  const value = item.params[param.key];
  if (value === null || value === undefined) return '';
  return param.kind === 'percent' ? String(Math.round(Number(value) * 100)) : String(value);
}

/**
 * One condition or action of a rule, rendered from its catalog definition (adding a type to
 * rule-catalog.ts is enough for it to appear here).
 */
@Component({
  selector: 'app-rule-item-editor',
  imports: [
    RouterLink,
    GiftGrid,
    SoundPreview,
    UiButton,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiSlider,
    UiSwitch,
    UiTooltip,
    LucideDynamicIcon,
    LucideArrowUp,
    LucideArrowDown,
    LucideTrash,
    LucideChevronRight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block rounded-lg border bg-surface shadow-xs' },
  templateUrl: './rule-item-editor.html',
})
export class RuleItemEditor {
  protected readonly assets = inject(AssetsStore);

  readonly item = input.required<ItemDraft>();
  readonly types = input.required<readonly TypeDef[]>();
  readonly kind = input.required<'condition' | 'action'>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  readonly op = output<ItemOp>();

  protected readonly def = computed(() => this.types().find((t) => t.type === this.item().type));
  protected readonly idPrefix = computed(() => `${this.kind()}-${this.index()}`);
  protected readonly icon = computed(() =>
    this.kind() === 'action'
      ? (actionKind(this.item().type)?.icon ?? CONDITION_ICON)
      : CONDITION_ICON,
  );
  protected readonly iconTone = computed(() =>
    this.kind() === 'action'
      ? (actionKind(this.item().type)?.tone ?? 'bg-surface-active text-muted-foreground')
      : 'bg-info-soft text-info-text',
  );
  protected readonly isGiftCondition = computed(
    () => this.item().type === 'giftName' || this.item().type === 'giftId',
  );
  protected readonly display = displayParam;
  protected readonly describedBy = describedBy;

  protected soundUrl(id: string): string | undefined {
    return this.assets.sounds().find((a) => String(a.id) === id)?.url;
  }

  protected set(param: ParamDef, raw: string | boolean): void {
    this.op.emit({ kind: 'param', param, raw });
  }
}
