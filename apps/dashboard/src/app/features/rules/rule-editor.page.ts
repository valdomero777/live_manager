import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideChevronRight,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCircleX,
  LucideFlaskConical,
  LucideSave,
  LucideTriangleAlert,
} from '@lucide/angular';
import type {
  GiftInfo,
  LiveEventType,
  Rule,
  RuleTestRequest,
  RuleTestResult,
} from '@tiklive/contracts';
import { AutomationBuilder } from '../../components/automations/automation-builder';
import type { RuleOp } from '../../components/automations/rule-ops';
import { GiftGrid } from '../../components/shared/gift-grid/gift-grid';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiBadge } from '../../components/ui/badge';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput, UiNativeSelect } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { ToastService } from '../../components/ui/toast';
import { AssetsStore } from '../../core/assets.store';
import { errorMessage } from '../../lib/labels';
import {
  ACTION_TYPES,
  CONDITION_TYPES,
  TEMPLATE_VARIABLES,
  collisions,
  typeDef,
  type ParamDef,
  type TypeDef,
} from '../../components/automations/rule-catalog';
import {
  EMPTY_DRAFT,
  draftFromRule,
  newItem,
  validateDraft,
  type ItemDraft,
  type ParamValue,
  type RuleDraft,
} from '../../components/automations/rule-draft';
import { RulesStore } from '../../core/rules.store';

type ListKey = 'conditions' | 'actions';

const CATALOG: Readonly<Record<ListKey, readonly TypeDef[]>> = {
  conditions: CONDITION_TYPES,
  actions: ACTION_TYPES,
};

/**
 * Rule editor (RF-05..RF-09): trigger, conditions (AND), actions, limits, JSON preview and a
 * "Probar" panel that runs the saved rule against a sample event.
 */
@Component({
  selector: 'app-rule-editor-page',
  imports: [
    RouterLink,
    JsonPipe,
    GiftGrid,
    PageHeader,
    AutomationBuilder,
    UiBadge,
    UiButton,
    UiSpinner,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiSwitch,
    ...UI_CARD,
    ...UI_ALERT,
    LucideArrowLeft,
    LucideSave,
    LucideFlaskConical,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideCircleX,
    LucideTriangleAlert,
    LucideChevronRight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page pb-24' },
  templateUrl: './rule-editor.page.html',
})
export class RuleEditorPage {
  /** Route param; undefined on /reglas/nueva. */
  readonly id = input<string>();

  private readonly store = inject(RulesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly assets = inject(AssetsStore);
  protected readonly catalog = CATALOG;

  protected readonly draft = signal<RuleDraft>(EMPTY_DRAFT);
  private readonly saved = signal<Rule | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly showErrors = signal(false);
  protected readonly testInput = signal<RuleTestRequest>({ quantity: 10 });
  protected readonly testResult = signal<RuleTestResult | undefined>(undefined);

  protected readonly isNew = computed(() => this.id() === undefined || this.id() === 'nueva');
  protected readonly validation = computed(() => validateDraft(this.draft()));
  /** Errors shown next to their field (the rest are listed by the save bar). */
  protected readonly nameError = computed(() => {
    if (!this.showErrors()) return undefined;
    return this.validation()
      .errors.find((e) => e.startsWith('Nombre'))
      ?.replace(/^Nombre: /, '');
  });
  protected readonly variables = computed(() => TEMPLATE_VARIABLES[this.draft().trigger] ?? []);
  protected readonly conditionTypes = computed(() =>
    CONDITION_TYPES.filter((c) => !c.appliesTo || c.appliesTo.includes(this.draft().trigger)),
  );
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    return (
      !saved ||
      JSON.stringify(validateDraft(draftFromRule(saved)).definition) !==
        JSON.stringify(this.validation().definition)
    );
  });
  protected readonly collisionNames = computed(() => {
    const saved = this.saved();
    const definition = this.validation().definition;
    if (!definition) return [];
    const candidate: Rule = { ...definition, id: saved?.id ?? -1, version: 1 };
    return collisions(candidate, this.store.rules()).map((r) => `«${r.name}»`);
  });

  constructor() {
    void this.init();
  }

  /** Applies an edit coming from the automation builder. */
  protected apply(op: RuleOp): void {
    switch (op.kind) {
      case 'trigger':
        return this.setTrigger(op.trigger);
      case 'add':
        return this.addItem(op.list, op.type);
      case 'remove':
        return this.removeItem(op.list, op.index);
      case 'move':
        return this.moveItem(op.list, op.index, op.delta);
      case 'type':
        return this.changeType(op.list, op.index, op.type);
      case 'param':
        return this.setParam(op.list, op.index, op.param, op.raw);
      case 'gift':
        return this.pickGift(op.index, op.gift);
    }
  }

  protected update<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected setTrigger(trigger: LiveEventType): void {
    this.draft.update((d) => ({
      ...d,
      trigger,
      // Conditions that no longer apply to the new trigger are dropped.
      conditions: d.conditions.filter((c) => {
        const def = typeDef(CONDITION_TYPES, c.type);
        return !def?.appliesTo || def.appliesTo.includes(trigger);
      }),
    }));
  }

  protected addItem(list: ListKey, type: string): void {
    if (!type) return;
    this.draft.update((d) => ({ ...d, [list]: [...d[list], newItem(CATALOG[list], type)] }));
  }

  protected removeItem(list: ListKey, index: number): void {
    this.draft.update((d) => ({ ...d, [list]: d[list].filter((_, i) => i !== index) }));
  }

  protected moveItem(list: ListKey, index: number, delta: number): void {
    this.draft.update((d) => {
      const items = [...d[list]];
      const target = index + delta;
      if (target < 0 || target >= items.length) return d;
      [items[index], items[target]] = [items[target] as ItemDraft, items[index] as ItemDraft];
      return { ...d, [list]: items };
    });
  }

  protected changeType(list: ListKey, index: number, type: string): void {
    this.replaceItem(list, index, newItem(CATALOG[list], type));
  }

  protected setParam(list: ListKey, index: number, param: ParamDef, raw: string | boolean): void {
    const item = this.draft()[list][index];
    if (!item) return;
    this.replaceItem(list, index, {
      ...item,
      params: { ...item.params, [param.key]: this.parse(param, raw) },
    });
  }

  protected setTest(key: keyof RuleTestRequest, raw: string): void {
    const numeric = key === 'quantity' || key === 'diamonds' || key === 'likes' || key === 'giftId';
    const value = raw === '' ? undefined : numeric ? Number(raw) : raw;
    this.testInput.update((t) => {
      const next = { ...t, [key]: value };
      // A typed gift name no longer matches the id of a gift picked from the list.
      if (key === 'giftName') delete next.giftId;
      return next;
    });
  }

  /** Gift picked in a giftName/giftId condition: fills its value and asks for equality. */
  protected pickGift(index: number, gift: GiftInfo): void {
    const item = this.draft().conditions[index];
    if (!item) return;
    const value = item.type === 'giftId' ? gift.id : gift.name;
    this.replaceItem('conditions', index, { ...item, params: { ...item.params, op: 'eq', value } });
  }

  protected pickTestGift(gift: GiftInfo): void {
    this.testInput.update((t) => ({
      ...t,
      giftName: gift.name,
      giftId: gift.id,
      diamonds: gift.diamonds,
    }));
  }

  protected conditionLabel(type: string): string {
    return typeDef(CONDITION_TYPES, type)?.label ?? type;
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    const { definition } = this.validation();
    if (!definition) return;
    await this.run(async () => {
      const rule = await this.store.save(this.saved()?.id, definition);
      this.saved.set(rule);
      this.draft.set(draftFromRule(rule));
      this.toast.success('Regla guardada', 'Los cambios ya están activos.');
      if (this.isNew()) await this.router.navigate(['/reglas', rule.id], { replaceUrl: true });
    });
  }

  protected async test(): Promise<void> {
    const saved = this.saved();
    if (!saved) return;
    await this.run(async () =>
      this.testResult.set(await this.store.test(saved.id, this.testInput())),
    );
  }

  private parse(param: ParamDef, raw: string | boolean): ParamValue {
    if (typeof raw === 'boolean') return raw;
    if (raw === '') return param.optional ? null : '';
    if (param.kind === 'percent') return Number(raw) / 100;
    if (param.kind === 'text' || param.kind === 'select') return raw;
    return Number(raw);
  }

  private replaceItem(list: ListKey, index: number, item: ItemDraft): void {
    this.draft.update((d) => ({ ...d, [list]: d[list].map((x, i) => (i === index ? item : x)) }));
  }

  private async init(): Promise<void> {
    await this.run(async () => {
      await Promise.all([this.assets.load(), this.store.load()]);
      const id = Number(this.id());
      if (this.isNew() || !Number.isInteger(id)) return;
      const rule = await this.store.get(id);
      this.saved.set(rule);
      this.draft.set(draftFromRule(rule));
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
