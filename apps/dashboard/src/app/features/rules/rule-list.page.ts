import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCircleAlert,
  LucideCopy,
  LucideEllipsis,
  LucideFlaskConical,
  LucidePencil,
  LucidePlus,
  LucideTrash,
  LucideWorkflow,
} from '@lucide/angular';
import type { ActionConfig, Rule } from '@tiklive/contracts';
import {
  AutomationCard,
  type AutomationActionView,
} from '../../components/automations/automation-card';
import { actionKind } from '../../components/automations/automation-meta';
import {
  collisions,
  describeAction,
  describeCondition,
} from '../../components/automations/rule-catalog';
import { EmptyState } from '../../components/shared/empty-state';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { UI_DROPDOWN_MENU } from '../../components/ui/dropdown-menu';
import { UiSkeleton } from '../../components/ui/feedback';
import { ToastService } from '../../components/ui/toast';
import { AssetsStore } from '../../core/assets.store';
import { RulesStore } from '../../core/rules.store';
import { errorMessage } from '../../lib/labels';

function actionView(
  action: ActionConfig,
  assetName: (id: number | undefined) => string,
): AutomationActionView {
  const kind = actionKind(action.type);
  return {
    icon: kind?.icon ?? LucideWorkflow,
    tone: kind?.tone ?? 'bg-surface-active text-muted-foreground',
    text: describeAction(action, assetName),
  };
}

function badgesOf(rule: Rule): string[] {
  const badges = [`Prioridad ${rule.priority}`];
  if (rule.cooldownMs) badges.push(`Espera ${rule.cooldownMs / 1000} s`);
  if (rule.mode === 'random') badges.push('Una acción al azar');
  return badges;
}

/** Automations list: enable/disable, duplicate, delete, and collision warnings (spec 13). */
@Component({
  selector: 'app-rule-list-page',
  imports: [
    RouterLink,
    PageHeader,
    AutomationCard,
    EmptyState,
    UiButton,
    UiSkeleton,
    ...UI_ALERT,
    ...UI_DROPDOWN_MENU,
    LucidePlus,
    LucidePencil,
    LucideCopy,
    LucideTrash,
    LucideEllipsis,
    LucideCircleAlert,
    LucideFlaskConical,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <app-page-header
      title="Reglas"
      description="Cada regla reacciona a un evento del LIVE. Se evalúan de mayor a menor prioridad y los cambios se aplican al instante, sin reiniciar."
    >
      <a uiButton routerLink="/reglas/nueva"><svg lucidePlus /> Nueva regla</a>
    </app-page-header>

    @if (error()) {
      <div uiAlert variant="destructive" role="alert">
        <svg lucideCircleAlert />
        <p uiAlertTitle>No se pudo completar la acción</p>
        <p uiAlertDescription>{{ error() }}</p>
      </div>
    }

    @if (loading()) {
      <div class="grid gap-4" aria-busy="true" aria-label="Cargando reglas">
        @for (i of [0, 1]; track i) {
          <div uiSkeleton class="h-44 rounded-xl"></div>
        }
      </div>
    } @else {
      <div class="grid gap-4">
        @for (item of items(); track item.rule.id) {
          <app-automation-card
            [id]="'rule-' + item.rule.id"
            [name]="item.rule.name"
            [enabled]="item.rule.enabled"
            [event]="item.rule.trigger"
            [conditions]="item.conditions"
            [actions]="item.actions"
            [badges]="item.badges"
            [warning]="item.warning"
            [busy]="busy()"
            (toggle)="toggle(item.rule, $event)"
          >
            <a
              automationCardActions
              uiButton
              variant="outline"
              size="sm"
              [routerLink]="['/reglas', item.rule.id]"
            >
              <svg lucidePencil /> Editar
            </a>
            <a
              automationCardActions
              uiButton
              variant="ghost"
              size="sm"
              [routerLink]="['/reglas', item.rule.id]"
              fragment="probar"
            >
              <svg lucideFlaskConical /> Probar
            </a>
            <span automationCardActions class="flex-1"></span>
            <button
              automationCardActions
              uiButton
              variant="ghost"
              size="icon-sm"
              type="button"
              [attr.aria-label]="'Más acciones para ' + item.rule.name"
              [cdkMenuTriggerFor]="more"
              [cdkMenuTriggerData]="{ $implicit: item.rule }"
            >
              <svg lucideEllipsis />
            </button>
          </app-automation-card>
        } @empty {
          <app-empty-state
            [icon]="emptyIcon"
            title="Aún no hay reglas"
            description="Crea tu primera automatización: por ejemplo, un sonido cuando alguien envía un regalo de 100 monedas o más."
          >
            <a uiButton routerLink="/reglas/nueva"><svg lucidePlus /> Nueva regla</a>
          </app-empty-state>
        }
      </div>
    }

    <ng-template #more let-rule>
      <div cdkMenu uiDropdownMenu>
        <button
          cdkMenuItem
          uiDropdownMenuItem
          [cdkMenuItemDisabled]="busy()"
          (cdkMenuItemTriggered)="duplicate(rule)"
        >
          <svg lucideCopy /> Duplicar
        </button>
        <div uiDropdownMenuSeparator></div>
        <button
          cdkMenuItem
          uiDropdownMenuItem
          variant="destructive"
          [cdkMenuItemDisabled]="busy()"
          (cdkMenuItemTriggered)="remove(rule)"
        >
          <svg lucideTrash /> Eliminar
        </button>
      </div>
    </ng-template>
  `,
})
export class RuleListPage {
  private readonly store = inject(RulesStore);
  private readonly assets = inject(AssetsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly emptyIcon = LucideWorkflow;
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly items = computed(() => {
    const rules = this.store.rules();
    const name = (id: number | undefined) => this.assets.nameOf(id);
    return [...rules]
      .sort((a, b) => b.priority - a.priority || a.id - b.id)
      .map((rule) => {
        const clash = collisions(rule, rules).map((r) => `«${r.name}»`);
        return {
          rule,
          conditions: rule.conditions.map(describeCondition),
          actions: rule.actions.map((a) => actionView(a, name)),
          badges: badgesOf(rule),
          warning: clash.length
            ? `Puede dispararse junto con ${clash.join(', ')} (mismo evento, pantalla y prioridad). Cambia la prioridad para decidir el orden.`
            : '',
        };
      });
  });

  constructor() {
    void this.run(() => Promise.all([this.store.load(), this.assets.load()])).finally(() =>
      this.loading.set(false),
    );
  }

  protected toggle(rule: Rule, enabled: boolean): Promise<void> {
    return this.run(async () => {
      await this.store.setEnabled(rule, enabled);
      this.toast.success(enabled ? `«${rule.name}» activada` : `«${rule.name}» pausada`);
    });
  }

  protected duplicate(rule: Rule): Promise<void> {
    if (this.busy()) return Promise.resolve();
    return this.run(async () => {
      await this.store.duplicate(rule);
      this.toast.success(
        'Regla duplicada',
        'La copia se creó desactivada para no dispararse dos veces.',
      );
    });
  }

  protected async remove(rule: Rule): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.confirm({
      title: `¿Eliminar la regla «${rule.name}»?`,
      description: 'Dejará de reaccionar a los eventos del LIVE. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.store.delete(rule.id);
      this.toast.success('Regla eliminada');
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
