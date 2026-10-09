import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePlus, LucideWorkflow } from '@lucide/angular';
import type { Rule } from '@tiklive/contracts';
import type { RuleExecution } from '../../core/admin-socket.service';
import { EmptyState } from '../shared/empty-state';
import { UiBadge, type BadgeVariant } from '../ui/badge';
import { UiButton } from '../ui/button';

const RESULTS: Readonly<Record<RuleExecution['result'], { label: string; badge: BadgeVariant }>> = {
  executed: { label: 'Ejecutada', badge: 'success' },
  limited: { label: 'Limitada', badge: 'warning' },
  failed: { label: 'Falló', badge: 'danger' },
};

const VISIBLE = 8;

/** Rules that reacted to the LIVE since this panel was opened, newest first. */
@Component({
  selector: 'app-recent-automations',
  imports: [DatePipe, RouterLink, UiBadge, UiButton, EmptyState, LucideWorkflow, LucidePlus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (rows().length) {
      <ul class="grid">
        @for (r of rows(); track $index) {
          <li class="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-automation-soft text-automation-text"
              aria-hidden="true"
            >
              <svg lucideWorkflow class="size-4" />
            </span>
            <div class="grid min-w-0 flex-1">
              @if (r.rule) {
                <a
                  [routerLink]="['/reglas', r.ruleId]"
                  class="truncate text-sm font-medium hover:underline"
                  >{{ r.name }}</a
                >
              } @else {
                <span class="truncate text-sm font-medium">{{ r.name }}</span>
              }
              <span class="type-caption">{{ r.trigger }}</span>
            </div>
            <span uiBadge [variant]="r.badge">{{ r.label }}</span>
            <time class="hidden w-16 shrink-0 text-right type-caption tabular-nums sm:block">{{
              r.at | date: 'HH:mm:ss'
            }}</time>
          </li>
        }
      </ul>
    } @else {
      <app-empty-state
        [icon]="emptyIcon"
        title="Ninguna automatización se ha ejecutado aún"
        [description]="
          activeRules()
            ? 'Cuando un evento cumpla una regla activa aparecerá aquí, en tiempo real.'
            : 'No tienes reglas activas. Crea una para reaccionar a regalos, follows o comentarios.'
        "
      >
        @if (!activeRules()) {
          <a uiButton size="sm" routerLink="/reglas/nueva"><svg lucidePlus /> Nueva regla</a>
        }
      </app-empty-state>
    }
  `,
})
export class RecentAutomations {
  readonly executions = input.required<readonly RuleExecution[]>();
  readonly rules = input.required<readonly Rule[]>();
  readonly triggerLabels = input.required<Readonly<Record<string, string>>>();

  protected readonly emptyIcon = LucideWorkflow;
  protected readonly activeRules = computed(() => this.rules().filter((r) => r.enabled).length);
  protected readonly rows = computed(() => {
    const byId = new Map(this.rules().map((r) => [r.id, r]));
    return this.executions()
      .slice(0, VISIBLE)
      .map((e) => {
        const rule = byId.get(e.ruleId);
        return {
          ...e,
          ...RESULTS[e.result],
          rule,
          name: rule?.name ?? `Regla #${e.ruleId}`,
          trigger: rule ? `Cuando: ${this.triggerLabels()[rule.trigger] ?? rule.trigger}` : '',
        };
      });
  });
}
