import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucidePause, LucidePlay, LucideSearch } from '@lucide/angular';
import { LIVE_EVENT_TYPES, type LiveEvent } from '@tiklive/contracts';
import { EventFeed } from '../../components/live/event-feed';
import { feedItemText, toFeedItem } from '../../components/live/event-format';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiBadge } from '../../components/ui/badge';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiInput, UiNativeSelect } from '../../components/ui/input';
import { AdminSocketService } from '../../core/admin-socket.service';
import { EVENT_LABELS } from '../../lib/labels';

/** Live event feed with type filter, text search and pause (spec 13: "Eventos en vivo"). */
@Component({
  selector: 'app-events-page',
  imports: [
    PageHeader,
    EventFeed,
    UiBadge,
    UiButton,
    UiInput,
    UiNativeSelect,
    ...UI_CARD,
    ...UI_ALERT,
    LucidePause,
    LucidePlay,
    LucideSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <app-page-header
      title="Eventos en vivo"
      description="Todo lo que llega de tu LIVE, en tiempo real. Se guardan los últimos 500 de esta sesión."
    />

    <section uiCard aria-label="Eventos">
      <div uiCardContent class="flex flex-col gap-3 md:flex-row md:items-center">
        <div class="relative min-w-0 flex-1">
          <svg
            lucideSearch
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label class="sr-only" for="q">Buscar por usuario o texto</label>
          <input
            uiInput
            id="q"
            type="search"
            class="pl-9"
            placeholder="Buscar por usuario o texto"
            (input)="query.set($any($event.target).value)"
          />
        </div>
        <div class="flex gap-2">
          <label class="sr-only" for="type">Tipo de evento</label>
          <select
            uiNativeSelect
            id="type"
            class="min-w-0 flex-1 md:w-48"
            (change)="type.set($any($event.target).value)"
          >
            <option value="">Todos los tipos</option>
            @for (t of types; track t) {
              <option [value]="t">{{ labels[t] }}</option>
            }
          </select>
          <button
            uiButton
            variant="outline"
            type="button"
            (click)="togglePause()"
            [attr.aria-pressed]="paused()"
          >
            @if (paused()) {
              <svg lucidePlay /> Reanudar
            } @else {
              <svg lucidePause /> Pausar
            }
          </button>
        </div>
      </div>

      <div uiCardContent class="flex items-center gap-2">
        <span uiBadge variant="secondary" aria-live="polite">{{ rows().length }} eventos</span>
        @if (paused()) {
          <span uiBadge variant="warning">Pausado</span>
          <span class="type-caption">La lista no se actualiza hasta que pulses «Reanudar».</span>
        }
      </div>

      <div uiCardContent>
        <app-event-feed
          [items]="rows()"
          [loading]="socket.historyLoading()"
          [realtime]="!socket.lostConnection()"
          height="min(70dvh, 44rem)"
          [emptyTitle]="filtered() ? 'Sin eventos que coincidan' : 'Aún no llegan eventos'"
          [emptyDescription]="
            filtered() ? 'Prueba con otro tipo o búsqueda.' : 'Inicia el live o usa el Simulador.'
          "
        />
      </div>
    </section>
  `,
})
export class EventsPage {
  protected readonly socket = inject(AdminSocketService);
  protected readonly types = LIVE_EVENT_TYPES;
  protected readonly labels = EVENT_LABELS;
  protected readonly type = signal<string>('');
  protected readonly query = signal('');
  protected readonly paused = signal(false);
  private readonly frozen = signal<readonly LiveEvent[]>([]);

  protected readonly filtered = computed(() => !!this.type() || !!this.query().trim());
  protected readonly rows = computed(() => {
    const events = this.paused() ? this.frozen() : this.socket.events();
    const type = this.type();
    const q = this.query().trim().toLowerCase();
    return events
      .filter((e) => !type || e.type === type)
      .map(toFeedItem)
      .filter((r) => !q || `${r.nickname} ${feedItemText(r)}`.toLowerCase().includes(q));
  });

  protected togglePause(): void {
    if (!this.paused()) this.frozen.set(this.socket.events());
    this.paused.update((p) => !p);
  }
}
