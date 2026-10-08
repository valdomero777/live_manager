import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  METRICS,
  SCOPES,
  type Goal,
  type GoalDefinition,
  type GoalProgress,
  type LeaderboardRow,
  type LeaderboardSettings,
  type Metric,
  type Scope,
} from '@tiklive/contracts';
import { ApiClient } from '../../core/api-client';
import { GOAL_METRIC_LABELS, METRIC_LABELS, SCOPE_LABELS, errorMessage } from '../../lib/labels';
import { GoalForm } from './goal-form';

const REFRESH_MS = 5_000;

type GoalWithProgress = Goal & { progress?: Omit<GoalProgress, 'seq'> };

/** Leaderboards (RF-12..14), goals (RF-15) and ranking privacy, in one place. */
@Component({
  selector: 'app-rankings-page',
  imports: [GoalForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rankings.page.html',
  styleUrl: './rankings.page.css',
})
export class RankingsPage {
  private readonly api = inject(ApiClient);
  protected readonly metrics = METRICS;
  protected readonly scopes = SCOPES;
  protected readonly metricLabels = METRIC_LABELS;
  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly goalMetricLabels = GOAL_METRIC_LABELS;

  protected readonly metric = signal<Metric>('diamonds');
  protected readonly scope = signal<Scope>('session');
  protected readonly rows = signal<readonly LeaderboardRow[]>([]);
  protected readonly goals = signal<readonly GoalWithProgress[]>([]);
  protected readonly editing = signal<Goal | 'new' | undefined>(undefined);
  protected readonly excluded = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);

  constructor() {
    void this.refresh();
    void this.loadExclusions();
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected select(metric: Metric, scope: Scope): void {
    this.metric.set(metric);
    this.scope.set(scope);
    void this.refresh();
  }

  protected async reset(scope: Scope): Promise<void> {
    const warning =
      scope === 'total'
        ? 'Se borrará el ranking HISTÓRICO completo. Esta acción no se puede deshacer. ¿Continuar?'
        : `Se reiniciará el ranking «${SCOPE_LABELS[scope]}». Los demás períodos no cambian. ¿Continuar?`;
    if (!confirm(warning)) return;
    await this.run(async () => {
      const r = await this.api.post<{ removed: number }>('/leaderboards/reset', {
        scope,
        confirm: true,
      });
      this.message.set({
        ok: true,
        text: `Ranking «${SCOPE_LABELS[scope]}» reiniciado (${r.removed} filas).`,
      });
    });
  }

  protected async saveGoal(definition: GoalDefinition): Promise<void> {
    const editing = this.editing();
    await this.run(async () => {
      if (editing && editing !== 'new') await this.api.put(`/goals/${editing.id}`, definition);
      else await this.api.post('/goals', definition);
      this.editing.set(undefined);
      this.message.set({ ok: true, text: `Meta «${definition.name}» guardada.` });
    });
  }

  protected async deleteGoal(goal: Goal): Promise<void> {
    if (!confirm(`¿Eliminar la meta «${goal.name}»?`)) return;
    await this.run(() => this.api.delete(`/goals/${goal.id}`));
  }

  protected async saveExclusions(): Promise<void> {
    const excludedUniqueIds = this.excluded()
      .split(/[\n,]/)
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean);
    await this.run(async () => {
      await this.api.put<LeaderboardSettings>('/settings/leaderboard', { excludedUniqueIds });
      this.message.set({ ok: true, text: 'Lista de usuarios ocultos guardada.' });
    });
  }

  protected isEditing(goal: Goal): boolean {
    const editing = this.editing();
    return editing !== undefined && editing !== 'new' && editing.id === goal.id;
  }

  protected percent(goal: GoalWithProgress): number {
    return Math.round((goal.progress?.ratio ?? 0) * 100);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.message.set(undefined);
    try {
      await action();
      await this.refresh();
    } catch (e) {
      this.message.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const board = await this.api.get<{ rows: LeaderboardRow[] }>(
        `/leaderboards/${this.metric()}?scope=${this.scope()}&limit=20`,
      );
      this.rows.set(board.rows);
      const goals = await this.api.get<Goal[]>('/goals');
      this.goals.set(
        await Promise.all(goals.map((g) => this.api.get<GoalWithProgress>(`/goals/${g.id}`))),
      );
    } catch {
      // keep the last data; the shell shows the connection state
    }
  }

  private async loadExclusions(): Promise<void> {
    const settings = await this.api.get<LeaderboardSettings>('/settings/leaderboard');
    this.excluded.set(settings.excludedUniqueIds.join('\n'));
  }
}
