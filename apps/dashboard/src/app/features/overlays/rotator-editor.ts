import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  METRICS,
  RotatorConfigSchema,
  SCOPES,
  STATS_FIELDS,
  type Goal,
  type RotatorConfig,
  type RotatorPanel,
} from '@tiklive/contracts';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideCircleAlert,
  LucidePlus,
  LucideSave,
  LucideTrash,
} from '@lucide/angular';
import { EmptyState } from '../../components/shared/empty-state';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UI_DROPDOWN_MENU } from '../../components/ui/dropdown-menu';
import { UiFormField } from '../../components/ui/form-field';
import { UiCheckbox, UiInput, UiNativeSelect } from '../../components/ui/input';
import { ToastService } from '../../components/ui/toast';
import { UiTooltip } from '../../components/ui/tooltip';
import { ApiClient } from '../../core/api-client';
import { METRIC_LABELS, SCOPE_LABELS, errorMessage } from '../../lib/labels';

const NEW_PANELS: Readonly<Record<RotatorPanel['type'], RotatorPanel>> = {
  leaderboard: {
    type: 'leaderboard',
    metric: 'diamonds',
    scope: 'session',
    limit: 5,
    durationMs: 10_000,
  },
  goal: { type: 'goal', goalId: 1, durationMs: 8_000 },
  stats: { type: 'stats', fields: ['viewers', 'likes', 'diamonds'], durationMs: 8_000 },
};

const PANEL_LABELS: Readonly<Record<RotatorPanel['type'], string>> = {
  leaderboard: 'Ranking',
  goal: 'Meta',
  stats: 'Estadísticas',
};

/** Edits a rotator configuration (RF-17): which panels alternate and for how long. */
@Component({
  selector: 'app-rotator-editor',
  imports: [
    UiButton,
    UiCheckbox,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiTooltip,
    EmptyState,
    ...UI_CARD,
    ...UI_ALERT,
    ...UI_DROPDOWN_MENU,
    LucideArrowUp,
    LucideArrowDown,
    LucideTrash,
    LucidePlus,
    LucideSave,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section uiCard aria-labelledby="rot-title">
      <header uiCardHeader>
        <h2 uiCardTitle id="rot-title">Paneles del rotator «{{ configId() }}»</h2>
        <p uiCardDescription>
          El overlay muestra cada panel durante su tiempo y pasa al siguiente.
        </p>
        <div uiCardAction>
          <label for="rot-tr" class="sr-only">Transición</label>
          <select
            uiNativeSelect
            size="sm"
            id="rot-tr"
            class="w-auto"
            (change)="transition.set($any($event.target).value)"
          >
            <option value="fade" [selected]="transition() === 'fade'">Fundido</option>
            <option value="none" [selected]="transition() === 'none'">Corte directo</option>
          </select>
        </div>
      </header>
      <div uiCardContent class="grid gap-3">
        @for (p of panels(); track $index; let i = $index) {
          <div class="rounded-lg border bg-surface">
            <div class="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <span
                class="grid size-6 place-items-center rounded-md bg-muted text-xs font-semibold tabular-nums"
                >{{ i + 1 }}</span
              >
              <span class="text-sm font-medium">{{ panelLabels[p.type] }}</span>
              <span class="flex-1"></span>
              <button
                uiButton
                variant="ghost"
                size="icon-sm"
                type="button"
                (click)="move(i, -1)"
                [disabled]="i === 0"
                aria-label="Subir"
                uiTooltip="Subir"
              >
                <svg lucideArrowUp />
              </button>
              <button
                uiButton
                variant="ghost"
                size="icon-sm"
                type="button"
                (click)="move(i, 1)"
                [disabled]="i === panels().length - 1"
                aria-label="Bajar"
                uiTooltip="Bajar"
              >
                <svg lucideArrowDown />
              </button>
              <button
                uiButton
                variant="ghost-destructive"
                size="icon-sm"
                type="button"
                (click)="remove(i)"
                aria-label="Quitar"
                uiTooltip="Quitar"
              >
                <svg lucideTrash />
              </button>
            </div>
            <div class="form-grid p-3">
              @switch (p.type) {
                @case ('leaderboard') {
                  <ui-form-field label="Métrica" [for]="'rp-m-' + i">
                    <select
                      uiNativeSelect
                      [id]="'rp-m-' + i"
                      (change)="patch(i, { metric: $any($event.target).value })"
                    >
                      @for (m of metrics; track m) {
                        <option [value]="m" [selected]="m === p.metric">
                          {{ metricLabels[m] }}
                        </option>
                      }
                    </select>
                  </ui-form-field>
                  <ui-form-field label="Período" [for]="'rp-s-' + i">
                    <select
                      uiNativeSelect
                      [id]="'rp-s-' + i"
                      (change)="patch(i, { scope: $any($event.target).value })"
                    >
                      @for (s of scopes; track s) {
                        <option [value]="s" [selected]="s === p.scope">{{ scopeLabels[s] }}</option>
                      }
                    </select>
                  </ui-form-field>
                  <ui-form-field label="Cuántos" [for]="'rp-l-' + i">
                    <input
                      uiInput
                      [id]="'rp-l-' + i"
                      type="number"
                      min="1"
                      max="20"
                      [value]="p.limit"
                      (input)="patch(i, { limit: +$any($event.target).value })"
                    />
                  </ui-form-field>
                  <ui-form-field label="Título" [for]="'rp-t-' + i" [optional]="true">
                    <input
                      uiInput
                      [id]="'rp-t-' + i"
                      type="text"
                      [value]="p.title ?? ''"
                      (input)="patch(i, { title: $any($event.target).value || undefined })"
                    />
                  </ui-form-field>
                }
                @case ('goal') {
                  <ui-form-field label="Meta" [for]="'rp-g-' + i">
                    <select
                      uiNativeSelect
                      [id]="'rp-g-' + i"
                      (change)="patch(i, { goalId: +$any($event.target).value })"
                    >
                      @for (g of goals(); track g.id) {
                        <option [value]="g.id" [selected]="g.id === p.goalId">{{ g.name }}</option>
                      }
                    </select>
                  </ui-form-field>
                }
                @case ('stats') {
                  <fieldset class="col-span-full m-0 grid gap-2 rounded-lg border p-3">
                    <legend class="px-1 type-label">Datos</legend>
                    <div class="flex flex-wrap gap-x-4 gap-y-2">
                      @for (f of statsFields; track f) {
                        <label class="flex items-center gap-2 text-sm">
                          <input
                            uiCheckbox
                            type="checkbox"
                            [checked]="p.fields.includes(f)"
                            (change)="toggleField(i, f, $any($event.target).checked)"
                          />
                          {{ f }}
                        </label>
                      }
                    </div>
                  </fieldset>
                }
              }
              <ui-form-field label="Duración (s)" [for]="'rp-d-' + i">
                <input
                  uiInput
                  [id]="'rp-d-' + i"
                  type="number"
                  min="2"
                  max="120"
                  [value]="p.durationMs / 1000"
                  (input)="patch(i, { durationMs: +$any($event.target).value * 1000 })"
                />
              </ui-form-field>
            </div>
          </div>
        } @empty {
          <app-empty-state
            title="Sin paneles"
            description="Agrega al menos un panel para que el rotator muestre algo."
            class="py-6"
          />
        }

        @if (message(); as m) {
          @if (!m.ok) {
            <div uiAlert variant="destructive" role="alert">
              <svg lucideCircleAlert />
              <p uiAlertDescription>{{ m.text }}</p>
            </div>
          }
        }
      </div>
      <footer uiCardFooter class="border-t border-border-subtle pt-4">
        <button uiButton variant="outline" size="sm" type="button" [cdkMenuTriggerFor]="addMenu">
          <svg lucidePlus /> Agregar panel
        </button>
        <span class="flex-1"></span>
        <button uiButton type="button" (click)="save()" [disabled]="busy()">
          <svg lucideSave /> Guardar rotator
        </button>
      </footer>
    </section>

    <ng-template #addMenu>
      <div cdkMenu uiDropdownMenu>
        <button cdkMenuItem uiDropdownMenuItem (cdkMenuItemTriggered)="addPanel('leaderboard')">
          Ranking
        </button>
        <button cdkMenuItem uiDropdownMenuItem (cdkMenuItemTriggered)="addPanel('goal')">
          Meta
        </button>
        <button cdkMenuItem uiDropdownMenuItem (cdkMenuItemTriggered)="addPanel('stats')">
          Estadísticas
        </button>
      </div>
    </ng-template>
  `,
})
export class RotatorEditor {
  readonly configId = input.required<string>();
  readonly savedChange = output();

  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  protected readonly metrics = METRICS;
  protected readonly scopes = SCOPES;
  protected readonly statsFields = STATS_FIELDS;
  protected readonly metricLabels = METRIC_LABELS;
  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly panelLabels = PANEL_LABELS;
  protected readonly panels = signal<readonly RotatorPanel[]>([]);
  protected readonly transition = signal<RotatorConfig['transition']>('fade');
  protected readonly goals = signal<readonly Goal[]>([]);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);

  constructor() {
    effect(() => void this.load(this.configId()));
  }

  protected addPanel(type: RotatorPanel['type']): void {
    const goalId = this.goals()[0]?.id ?? 1;
    const panel = type === 'goal' ? { ...NEW_PANELS.goal, goalId } : NEW_PANELS[type];
    this.panels.update((p) => [...p, panel]);
  }

  protected patch(index: number, changes: Partial<RotatorPanel>): void {
    this.panels.update((list) =>
      list.map((p, i) => (i === index ? ({ ...p, ...changes } as RotatorPanel) : p)),
    );
  }

  protected toggleField(
    index: number,
    field: (typeof STATS_FIELDS)[number],
    checked: boolean,
  ): void {
    const panel = this.panels()[index];
    if (panel?.type !== 'stats') return;
    const fields = STATS_FIELDS.filter((f) => (f === field ? checked : panel.fields.includes(f)));
    this.patch(index, { fields });
  }

  protected move(index: number, delta: number): void {
    this.panels.update((list) => {
      const items = [...list];
      const target = index + delta;
      if (target < 0 || target >= items.length) return list;
      [items[index], items[target]] = [items[target] as RotatorPanel, items[index] as RotatorPanel];
      return items;
    });
  }

  protected remove(index: number): void {
    this.panels.update((list) => list.filter((_, i) => i !== index));
  }

  protected async save(): Promise<void> {
    const parsed = RotatorConfigSchema.safeParse({
      transition: this.transition(),
      panels: this.panels(),
    });
    if (!parsed.success) {
      this.message.set({
        ok: false,
        text: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      return;
    }
    this.busy.set(true);
    try {
      await this.api.put(`/rotators/${this.configId()}`, parsed.data);
      this.message.set(undefined);
      this.toast.success('Rotator guardado', 'Las fuentes abiertas lo aplican al recargarse.');
      this.savedChange.emit();
    } catch (e) {
      this.message.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      const [config, goals] = await Promise.all([
        this.api.get<RotatorConfig>(`/rotators/${encodeURIComponent(id)}`),
        this.api.get<Goal[]>('/goals'),
      ]);
      this.panels.set(config.panels);
      this.transition.set(config.transition);
      this.goals.set(goals);
    } catch (e) {
      this.message.set({ ok: false, text: errorMessage(e) });
    }
  }
}
