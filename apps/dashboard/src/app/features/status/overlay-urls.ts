import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button';

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
  imports: [CopyButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <label for="host">Dirección del servidor</label>
      <select id="host" (change)="host.set($any($event.target).value)">
        @for (h of hosts(); track h) {
          <option [value]="h" [selected]="h + '' === host() + ''">{{ h }}</option>
        }
      </select>
    </div>
    <p class="muted">
      Usa la IP de la red local para la PC de stream; «localhost» solo funciona en esta misma
      máquina.
    </p>
    <ul class="list">
      @for (o of links(); track o.name) {
        <li>
          <div>
            <strong>{{ o.name }}</strong>
            <span class="muted"> · {{ o.help }}</span>
          </div>
          <div class="row url">
            <code>{{ o.url }}</code>
            <app-copy-button [value]="o.url" [label]="o.name" />
            <a class="button" [href]="o.url" target="_blank" rel="noopener">Abrir</a>
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    select {
      width: auto;
      min-width: 14rem;
    }
    .list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.85rem;
    }
    .url code {
      flex: 1 1 20rem;
      padding: 0.35rem 0.5rem;
      background: var(--surface-2);
      border-radius: 6px;
      overflow-wrap: anywhere;
    }
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
