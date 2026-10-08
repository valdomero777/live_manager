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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack" aria-labelledby="rot-title">
      <h2 id="rot-title">Paneles del rotator «{{ configId() }}»</h2>
      <p class="muted">El overlay muestra cada panel durante su tiempo y pasa al siguiente.</p>

      @for (p of panels(); track $index; let i = $index) {
        <div class="panel">
          <div class="row">
            <strong>{{ i + 1 }}. {{ panelLabels[p.type] }}</strong>
            <span class="spacer"></span>
            <button type="button" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Subir">
              ↑
            </button>
            <button
              type="button"
              (click)="move(i, 1)"
              [disabled]="i === panels().length - 1"
              aria-label="Bajar"
            >
              ↓
            </button>
            <button type="button" class="danger" (click)="remove(i)">Quitar</button>
          </div>
          <div class="grid">
            @switch (p.type) {
              @case ('leaderboard') {
                <div class="field">
                  <label [for]="'rp-m-' + i">Métrica</label>
                  <select
                    [id]="'rp-m-' + i"
                    (change)="patch(i, { metric: $any($event.target).value })"
                  >
                    @for (m of metrics; track m) {
                      <option [value]="m" [selected]="m + '' === p.metric + ''">
                        {{ metricLabels[m] }}
                      </option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label [for]="'rp-s-' + i">Período</label>
                  <select
                    [id]="'rp-s-' + i"
                    (change)="patch(i, { scope: $any($event.target).value })"
                  >
                    @for (s of scopes; track s) {
                      <option [value]="s" [selected]="s + '' === p.scope + ''">
                        {{ scopeLabels[s] }}
                      </option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label [for]="'rp-l-' + i">Cuántos</label>
                  <input
                    [id]="'rp-l-' + i"
                    type="number"
                    min="1"
                    max="20"
                    [value]="p.limit"
                    (input)="patch(i, { limit: +$any($event.target).value })"
                  />
                </div>
                <div class="field">
                  <label [for]="'rp-t-' + i">Título (opcional)</label>
                  <input
                    [id]="'rp-t-' + i"
                    type="text"
                    [value]="p.title ?? ''"
                    (input)="patch(i, { title: $any($event.target).value || undefined })"
                  />
                </div>
              }
              @case ('goal') {
                <div class="field">
                  <label [for]="'rp-g-' + i">Meta</label>
                  <select
                    [id]="'rp-g-' + i"
                    (change)="patch(i, { goalId: +$any($event.target).value })"
                  >
                    @for (g of goals(); track g.id) {
                      <option [value]="g.id" [selected]="g.id + '' === p.goalId + ''">
                        {{ g.name }}
                      </option>
                    }
                  </select>
                </div>
              }
              @case ('stats') {
                <fieldset class="field">
                  <legend>Datos</legend>
                  @for (f of statsFields; track f) {
                    <label class="check">
                      <input
                        type="checkbox"
                        [checked]="p.fields.includes(f)"
                        (change)="toggleField(i, f, $any($event.target).checked)"
                      />
                      {{ f }}
                    </label>
                  }
                </fieldset>
              }
            }
            <div class="field">
              <label [for]="'rp-d-' + i">Duración (s)</label>
              <input
                [id]="'rp-d-' + i"
                type="number"
                min="2"
                max="120"
                [value]="p.durationMs / 1000"
                (input)="patch(i, { durationMs: +$any($event.target).value * 1000 })"
              />
            </div>
          </div>
        </div>
      }

      <div class="row">
        <label for="rot-add" class="sr-only">Panel a agregar</label>
        <select #add id="rot-add">
          <option value="leaderboard">Ranking</option>
          <option value="goal">Meta</option>
          <option value="stats">Estadísticas</option>
        </select>
        <button type="button" (click)="addPanel($any(add.value))">Agregar panel</button>
        <span class="spacer"></span>
        <label for="rot-tr">Transición</label>
        <select id="rot-tr" (change)="transition.set($any($event.target).value)">
          <option value="fade" [selected]="'fade' === transition() + ''">Fundido</option>
          <option value="none" [selected]="'none' === transition() + ''">Corte directo</option>
        </select>
      </div>
      @if (message(); as m) {
        <p class="notice" [class.ok]="m.ok" [class.danger]="!m.ok" role="status">{{ m.text }}</p>
      }
      <div class="row">
        <button class="primary" type="button" (click)="save()" [disabled]="busy()">
          Guardar rotator
        </button>
      </div>
    </section>
  `,
  styles: `
    .panel {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
    }
    .field {
      display: grid;
      gap: 0.3rem;
      align-content: start;
    }
    fieldset {
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 500;
    }
    .spacer {
      flex: 1;
    }
    .row select {
      width: auto;
    }
  `,
})
export class RotatorEditor {
  readonly configId = input.required<string>();
  readonly savedChange = output();

  private readonly api = inject(ApiClient);
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
      this.message.set({
        ok: true,
        text: 'Rotator guardado. Las fuentes abiertas lo aplican al recargarse.',
      });
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
