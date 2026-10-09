import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LucideExternalLink } from '@lucide/angular';
import { CopyButton } from '../../components/shared/copy-button';
import { UiButton } from '../../components/ui/button';
import { UiFormField } from '../../components/ui/form-field';
import { UiNativeSelect } from '../../components/ui/input';

interface OverlayLink {
  readonly name: string;
  readonly help: string;
  readonly path: string;
}

const OVERLAYS: readonly OverlayLink[] = [
  {
    name: 'Pestaña de audio',
    help: 'Ábrela en el navegador de la PC de stream y pulsa «Iniciar audio».',
    path: '/screen/audio/',
  },
  {
    name: 'Alertas',
    help: 'Fuente Link (LIVE Studio) o Browser Source (OBS).',
    path: '/screen/alerts/',
  },
  {
    name: 'Rotator',
    help: 'Rankings y estadísticas alternándose en una sola fuente.',
    path: '/overlay/rotator/?config=main',
  },
  {
    name: 'Ranking de regalos',
    help: 'Top de diamantes de la sesión.',
    path: '/overlay/leaderboard/?metric=diamonds&limit=5',
  },
  {
    name: 'Ranking de likes',
    help: 'Top de likes de la sesión.',
    path: '/overlay/leaderboard/?metric=likes&limit=5',
  },
  {
    name: 'Meta',
    help: 'Barra de la meta 1; cambia goalId para otra meta.',
    path: '/overlay/goal/?goalId=1',
  },
  {
    name: 'Estadísticas',
    help: 'Espectadores, likes y diamantes.',
    path: '/overlay/stats/?fields=viewers,likes,diamonds',
  },
];

/** Ready-to-paste overlay URLs using a LAN address, so they work from the stream PC. */
@Component({
  selector: 'app-overlay-urls',
  imports: [CopyButton, UiButton, UiNativeSelect, UiFormField, LucideExternalLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    <ui-form-field
      label="Dirección del servidor"
      for="host"
      description="Usa la IP de la red local para la PC de stream; «localhost» solo funciona en esta misma máquina."
      class="max-w-sm"
    >
      <select
        uiNativeSelect
        id="host"
        aria-describedby="host-description"
        (change)="host.set($any($event.target).value)"
      >
        @for (h of hosts(); track h) {
          <option [value]="h" [selected]="h === host()">{{ h }}</option>
        }
      </select>
    </ui-form-field>
    <ul class="grid divide-y divide-border-subtle rounded-lg border">
      @for (o of links(); track o.name) {
        <li class="grid gap-2 p-3 sm:p-4">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-sm font-medium">{{ o.name }}</span>
            <span class="type-caption">{{ o.help }}</span>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              class="min-w-0 flex-1 rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs break-all text-muted-foreground"
              >{{ o.url }}</code
            >
            <div class="flex gap-2">
              <app-copy-button [value]="o.url" [label]="o.name" />
              <a uiButton variant="ghost" size="sm" [href]="o.url" target="_blank" rel="noopener">
                <svg lucideExternalLink /> Abrir
              </a>
            </div>
          </div>
        </li>
      }
    </ul>
  `,
})
export class OverlayUrls {
  readonly overlayKey = input.required<string>();
  readonly lanAddresses = input<readonly string[]>([]);

  /** host:port options: LAN IPs first, then the address this page was opened with. */
  protected readonly hosts = computed(() => {
    const port = location.port ? `:${location.port}` : '';
    return [...new Set([...this.lanAddresses().map((a) => `${a}${port}`), location.host])];
  });
  protected readonly host = signal<string>('');

  protected readonly links = computed(() => {
    const host = this.host() || this.hosts()[0] || location.host;
    const key = encodeURIComponent(this.overlayKey());
    return OVERLAYS.map((o) => {
      const separator = o.path.includes('?') ? '&' : '?';
      return { ...o, url: `${location.protocol}//${host}${o.path}${separator}key=${key}` };
    });
  });
}
