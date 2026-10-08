import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Rule } from '@tiklive/contracts';
import { AssetsStore } from '../../core/assets.store';
import { EVENT_LABELS, errorMessage } from '../../shared/labels';
import { collisions, describeAction, describeCondition } from './rule-catalog';
import { RulesStore } from './rules.store';

/** Rules overview: enable/disable, duplicate, delete, and collision warnings (spec 13). */
@Component({
  selector: 'app-rule-list-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <h1>Reglas</h1>
      <span class="spacer"></span>
      <a class="button primary" routerLink="/reglas/nueva">Nueva regla</a>
    </div>
    <p class="muted">
      Cada regla reacciona a un tipo de evento. Se evalúan de mayor a menor prioridad y los cambios
      se aplican al instante, sin reiniciar.
    </p>
    @if (error()) {
      <p class="notice danger" role="alert">{{ error() }}</p>
    }

    <div class="stack">
      @for (item of items(); track item.rule.id) {
        <article class="card rule" [class.off]="!item.rule.enabled">
          <div class="head">
            <label class="switch">
              <input
                type="checkbox"
                [checked]="item.rule.enabled"
                (change)="toggle(item.rule, $any($event.target).checked)"
                [disabled]="busy()"
                [attr.aria-label]="'Activar ' + item.rule.name"
              />
              <span>{{ item.rule.enabled ? 'Activa' : 'Inactiva' }}</span>
            </label>
            <h2>{{ item.rule.name }}</h2>
            <span class="badge">{{ eventLabels[item.rule.trigger] }}</span>
            <span class="badge">Prioridad {{ item.rule.priority }}</span>
            @if (item.rule.cooldownMs) {
              <span class="badge">Espera {{ item.rule.cooldownMs / 1000 }} s</span>
            }
            @if (item.rule.mode === 'random') {
              <span class="badge">Una acción al azar</span>
            }
          </div>
          <div class="body">
            <div>
              <h3>Si</h3>
              <ul>
                @for (c of item.conditions; track $index) {
                  <li>{{ c }}</li>
                } @empty {
                  <li class="muted">Siempre (sin condiciones)</li>
                }
              </ul>
            </div>
            <div>
              <h3>Entonces</h3>
              <ul>
                @for (a of item.actions; track $index) {
                  <li>{{ a }}</li>
                }
              </ul>
            </div>
          </div>
          @if (item.collisions.length) {
            <p class="notice warn">
              Puede dispararse junto con {{ item.collisions.join(', ') }} (mismo evento, pantalla y
              prioridad). Cambia la prioridad para decidir el orden.
            </p>
          }
          <div class="row">
            <a class="button" [routerLink]="['/reglas', item.rule.id]">Editar y probar</a>
            <button type="button" (click)="duplicate(item.rule)" [disabled]="busy()">
              Duplicar
            </button>
            <button type="button" class="danger" (click)="remove(item.rule)" [disabled]="busy()">
              Eliminar
            </button>
          </div>
        </article>
      } @empty {
        <p class="card muted">Aún no hay reglas. Crea la primera con «Nueva regla».</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
    }
    .spacer {
      flex: 1;
    }
    .rule {
      display: grid;
      gap: 0.75rem;
    }
    .rule.off {
      opacity: 0.7;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
    }
    .head h2 {
      margin: 0;
    }
    .switch {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 500;
    }
    .body {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 1rem;
    }
    h3 {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }
    ul {
      margin: 0;
      padding-left: 1.1rem;
    }
  `,
})
export class RuleListPage {
  private readonly store = inject(RulesStore);
  private readonly assets = inject(AssetsStore);
  protected readonly eventLabels = EVENT_LABELS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly items = computed(() => {
    const rules = this.store.rules();
    const name = (id: number | undefined) => this.assets.nameOf(id);
    return [...rules]
      .sort((a, b) => b.priority - a.priority || a.id - b.id)
      .map((rule) => ({
        rule,
        conditions: rule.conditions.map(describeCondition),
        actions: rule.actions.map((a) => describeAction(a, name)),
        collisions: collisions(rule, rules).map((r) => `«${r.name}»`),
      }));
  });

  constructor() {
    void this.run(() => Promise.all([this.store.load(), this.assets.load()]));
  }

  protected toggle(rule: Rule, enabled: boolean): Promise<void> {
    return this.run(() => this.store.setEnabled(rule, enabled));
  }

  protected duplicate(rule: Rule): Promise<void> {
    return this.run(() => this.store.duplicate(rule));
  }

  protected remove(rule: Rule): Promise<void> {
    if (!confirm(`¿Eliminar la regla «${rule.name}»?`)) return Promise.resolve();
    return this.run(() => this.store.delete(rule.id));
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
