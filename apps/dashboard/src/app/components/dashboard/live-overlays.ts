import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { LucideLayers } from '@lucide/angular';
import type { OverlayTemplate } from '@tiklive/contracts';
import { OverlayKeyStore } from '../../core/overlay-key.store';
import { OverlayTemplatesStore } from '../../core/overlay-templates.store';
import { OVERLAY_TYPES, buildOverlayUrl } from '../../features/overlays/overlay-catalog';
import { EmptyState } from '../shared/empty-state';
import { UiBadge } from '../ui/badge';
import { UiSwitch } from '../ui/switch';

const ALERTS_KEY = 'tiklive.dashboard.alerts';

interface Tile {
  readonly id: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly url: SafeResourceUrl;
}

function readAlertsPreference(): boolean {
  try {
    return localStorage.getItem(ALERTS_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * The overlays running live inside the dashboard: the alerts plus every template pinned from the
 * Overlays page. They are the real overlay pages, connected like any OBS or LIVE Studio source.
 */
@Component({
  selector: 'app-live-overlays',
  imports: [EmptyState, UiBadge, UiSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    <div class="flex items-center gap-3">
      <ui-switch
        inputId="live-alerts"
        [checked]="showAlerts()"
        (checkedChange)="setShowAlerts($event)"
      />
      <label class="type-label" for="live-alerts">Mostrar alertas aquí</label>
    </div>

    @if (!keys.key()) {
      <p class="type-secondary">Cargando overlays…</p>
    } @else if (tiles().length) {
      <div class="grid gap-4 sm:grid-cols-2">
        @for (tile of tiles(); track tile.id) {
          <figure class="m-0 grid gap-2">
            <figcaption class="flex items-center gap-2">
              <span class="min-w-0 truncate text-sm font-medium">{{ tile.name }}</span>
              <span uiBadge variant="outline">{{ tile.typeLabel }}</span>
            </figcaption>
            <!-- Checkerboard: stand-in for the stream behind a transparent overlay. -->
            <div class="aspect-video overflow-hidden rounded-lg border bg-checker">
              <iframe
                [src]="tile.url"
                [title]="'Overlay en vivo: ' + tile.name"
                class="size-full border-0 bg-transparent scheme-light"
              ></iframe>
            </div>
          </figure>
        }
      </div>
    } @else {
      <app-empty-state
        [icon]="icons.layers"
        title="Ningún overlay en el dashboard"
        description="En Overlays guarda una plantilla y activa «Mostrar en el dashboard» para verla aquí en vivo."
      />
    }
  `,
})
export class LiveOverlays {
  protected readonly keys = inject(OverlayKeyStore);
  private readonly templates = inject(OverlayTemplatesStore);
  private readonly sanitizer = inject(DomSanitizer);
  /** Same URL → same SafeResourceUrl, so unrelated changes never reload a running iframe. */
  private readonly safeUrls = new Map<string, SafeResourceUrl>();

  protected readonly icons = { layers: LucideLayers };
  protected readonly showAlerts = signal(readAlertsPreference());

  protected readonly tiles = computed<readonly Tile[]>(() => {
    const key = this.keys.key();
    const pinned = this.templates.templates().filter((t) => t.pinned);
    const hasAlertsTemplate = pinned.some((t) => t.type === 'alerts');
    const builtIn: OverlayTemplate[] =
      this.showAlerts() && !hasAlertsTemplate
        ? [
            {
              id: 'alerts',
              name: 'Alertas',
              type: 'alerts',
              params: {},
              pinned: true,
              updatedAt: 0,
            },
          ]
        : [];
    return [...builtIn, ...pinned.filter((t) => t.type !== 'alerts' || this.showAlerts())].flatMap(
      (t) => {
        const type = OVERLAY_TYPES.find((o) => o.id === t.type);
        if (!type) return [];
        const url = buildOverlayUrl(type, t.params, key, location.origin);
        return [{ id: t.id, name: t.name, typeLabel: type.label, url: this.safe(url) }];
      },
    );
  });

  constructor() {
    void this.keys.load();
    void this.templates.load().catch(() => undefined);
  }

  protected setShowAlerts(show: boolean): void {
    this.showAlerts.set(show);
    try {
      localStorage.setItem(ALERTS_KEY, show ? '1' : '0');
    } catch {
      // storage blocked: the preference lasts for this visit
    }
  }

  private safe(url: string): SafeResourceUrl {
    let safe = this.safeUrls.get(url);
    if (!safe) {
      safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.safeUrls.set(url, safe);
    }
    return safe;
  }
}
