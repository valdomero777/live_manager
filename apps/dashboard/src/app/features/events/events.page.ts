import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LIVE_EVENT_TYPES, type LiveEvent, type LiveEventType } from '@tiklive/contracts';
import { AdminSocketService } from '../../core/admin-socket.service';
import { EVENT_LABELS } from '../../lib/labels';

function detail(e: LiveEvent): string {
  switch (e.type) {
    case 'comment':
      return e.text;
    case 'gift':
      return `${e.quantity} × ${e.giftName} (${e.diamondValue * e.quantity} diamantes)`;
    case 'like':
      return `${e.likeDelta} likes · total del live ${e.totalLikes}`;
    case 'viewerCount':
      return `${e.viewerCount} espectadores`;
    default:
      return '';
  }
}

interface Row {
  readonly id: string;
  readonly at: number;
  readonly type: LiveEventType;
  readonly who: string;
  readonly detail: string;
}

/** Live event feed with type filter, text search and pause (spec 13: "Eventos en vivo"). */
@Component({
  selector: 'app-events-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Eventos en vivo</h1>
    <div class="card stack">
      <div class="row filters">
        <label for="type">Tipo</label>
        <select id="type" (change)="type.set($any($event.target).value)">
          <option value="">Todos</option>
          @for (t of types; track t) {
            <option [value]="t">{{ labels[t] }}</option>
          }
        </select>
        <label for="q">Buscar</label>
        <input
          id="q"
          type="search"
          placeholder="usuario o texto"
          (input)="query.set($any($event.target).value)"
        />
        <button type="button" (click)="togglePause()" [attr.aria-pressed]="paused()">
          {{ paused() ? 'Reanudar' : 'Pausar' }}
        </button>
        <span class="muted" aria-live="polite">{{ rows().length }} eventos</span>
      </div>
      @if (paused()) {
        <p class="notice info">Pausado: la lista no se actualiza hasta que pulses «Reanudar».</p>
      }
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Tipo</th>
              <th scope="col">Usuario</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td class="muted">{{ r.at | date: 'HH:mm:ss' }}</td>
                <td>
                  <span class="badge">{{ labels[r.type] }}</span>
                </td>
                <td>{{ r.who }}</td>
                <td>{{ r.detail }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="muted">
                  Sin eventos que coincidan. Inicia el live o usa el Simulador.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .filters select,
    .filters input {
      width: auto;
    }
    .filters input {
      flex: 1 1 12rem;
    }
    .table-wrap {
      max-height: 70vh;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      padding: 0.4rem 0.6rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--surface);
    }
  `,
})
export class EventsPage {
  private readonly socket = inject(AdminSocketService);
  protected readonly types = LIVE_EVENT_TYPES;
  protected readonly labels = EVENT_LABELS;
  protected readonly type = signal<string>('');
  protected readonly query = signal('');
  protected readonly paused = signal(false);
  private readonly frozen = signal<readonly LiveEvent[]>([]);

  protected readonly rows = computed<Row[]>(() => {
    const events = this.paused() ? this.frozen() : this.socket.events();
    const type = this.type();
    const q = this.query().trim().toLowerCase();
    return events
      .filter((e) => !type || e.type === type)
      .map((e) => ({
        id: e.id,
        at: e.occurredAt,
        type: e.type,
        who: 'viewer' in e ? `@${e.viewer.uniqueId}` : '',
        detail: detail(e),
      }))
      .filter((r) => !q || `${r.who} ${r.detail}`.toLowerCase().includes(q));
  });

  protected togglePause(): void {
    if (!this.paused()) this.frozen.set(this.socket.events());
    this.paused.update((p) => !p);
  }
}
