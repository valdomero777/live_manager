import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideFlaskConical, LucideRadio, LucideTimer } from '@lucide/angular';
import type { ConnectorStatus } from '@tiklive/contracts';
import { LiveStatus } from '../live/live-status';
import { liveStateOf } from '../live/live-state';
import { UiButton } from '../ui/button';
import { UI_CARD } from '../ui/card';

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

/** Top of the dashboard: is the LIVE connected, since when, and the next action to take. */
@Component({
  selector: 'app-live-session-card',
  imports: [RouterLink, LiveStatus, UiButton, LucideRadio, LucideFlaskConical, LucideTimer, ...UI_CARD],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section uiCard class="relative overflow-hidden" aria-label="Sesión LIVE">
      @if (isLive()) {
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-live via-primary to-gift"
          aria-hidden="true"
        ></div>
      }
      <div uiCardContent class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="grid min-w-0 gap-2">
          <app-live-status [status]="status()" variant="full" />
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 type-secondary">
            @if (status()?.target; as target) {
              <span class="font-medium text-foreground">&#64;{{ target }}</span>
            }
            @if (duration(); as d) {
              <span class="inline-flex items-center gap-1.5">
                <svg lucideTimer class="size-3.5" /> En vivo hace {{ d }}
              </span>
            }
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a uiButton [variant]="isLive() ? 'outline' : 'default'" routerLink="/estado">
            <svg lucideRadio /> {{ isLive() ? 'Gestionar conexión' : 'Conectar a TikTok' }}
          </a>
          <a uiButton variant="outline" routerLink="/simulador">
            <svg lucideFlaskConical /> Simular evento
          </a>
        </div>
      </div>
    </section>
  `,
})
export class LiveSessionCard {
  readonly status = input<ConnectorStatus | undefined>();
  /** Session start (ms) from /stats; null when no live session is open. */
  readonly startedAt = input<number | null>(null);
  /** Re-evaluated by the parent's clock tick. */
  readonly now = input(Date.now());

  protected readonly isLive = computed(() => liveStateOf(this.status()).state === 'live');
  protected readonly duration = computed(() => {
    const started = this.startedAt();
    return started && this.isLive() ? formatDuration(this.now() - started) : '';
  });
}
