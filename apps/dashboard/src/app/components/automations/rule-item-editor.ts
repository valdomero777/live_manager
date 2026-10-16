import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideTrash,
} from '@lucide/angular';
import { SOUND_ORIGIN_LABELS, type SoundOrigin } from '@tiklive/contracts';
import { AssetsStore } from '../../core/assets.store';
import { GiftGrid } from '../shared/gift-grid/gift-grid';
import { UiButton } from '../ui/button';
import { UiFormField, describedBy } from '../ui/form-field';
import { UiInput, UiNativeSelect, UiSlider } from '../ui/input';
import { UiSwitch } from '../ui/switch';
import { UiTooltip } from '../ui/tooltip';

import type { PickedSound } from '../sounds/picked-sound';
import { SoundPreview } from '../sounds/sound-preview';
import { SoundSelector } from '../sounds/sound-selector';
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
    GiftGrid,
    SoundPreview,
    SoundSelector,
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

  /** The sound this action plays, from the library or from a catalogue, for the picker row. */
  protected readonly sound = computed(() => {
    const params = this.item().params;
    const remote = params['soundUrl'];
    if (typeof remote === 'string' && remote) {
      const origin = (params['soundSource'] as SoundOrigin | null) ?? 'myinstants';
      return {
        url: remote,
        title: String(params['soundTitle'] ?? remote),
        origin,
        id: undefined,
      };
    }
    const assetId = params['assetId'];
    if (assetId === null || assetId === undefined || assetId === '') return undefined;
    const asset = this.assets.assets().find((a) => String(a.id) === String(assetId));
    return {
      url: asset?.url,
      title: this.assets.nameOf(Number(assetId)),
      origin: 'library' as SoundOrigin,
      id: String(assetId),
    };
  });
  protected readonly originLabels = SOUND_ORIGIN_LABELS;

  protected pickSound(sound: PickedSound): void {
    this.op.emit({ kind: 'sound', sound });
  }

  protected set(param: ParamDef, raw: string | boolean): void {
    this.op.emit({ kind: 'param', param, raw });
  }
}
