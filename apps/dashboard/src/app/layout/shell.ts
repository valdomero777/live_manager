import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminSocketService } from '../core/admin-socket.service';
import { AuthStore } from '../core/auth.store';

/** Main navigation, in the order of a typical session: watch, configure, rehearse. */
const NAV = [
  { path: '/estado', label: 'Estado' },
  { path: '/eventos', label: 'Eventos' },
  { path: '/reglas', label: 'Reglas' },
  { path: '/triggers', label: 'Triggers de sonido' },
  { path: '/rankings', label: 'Rankings y metas' },
  { path: '/assets', label: 'Sonidos e imágenes' },
  { path: '/overlays', label: 'Overlays' },
  { path: '/simulador', label: 'Simulador' },
  { path: '/ajustes', label: 'Ajustes' },
] as const;

/** App frame for signed-in pages: header, navigation and the live connection indicator. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="top">
      <strong class="brand">TikLive</strong>
      <nav aria-label="Principal">
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page">{{
            item.label
          }}</a>
        }
      </nav>
      <span class="spacer"></span>
      <span class="badge" [class.ok]="socket.connected()" [class.danger]="!socket.connected()">
        {{ socket.connected() ? 'Panel conectado' : 'Reconectando…' }}
      </span>
      <button type="button" (click)="logout()">Cerrar sesión</button>
    </header>
    <main id="contenido" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    .top {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1.25rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .brand {
      font-size: 1.1rem;
      color: var(--accent);
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    nav a {
      padding: 0.35rem 0.75rem;
      border-radius: 8px;
      color: var(--text);
      text-decoration: none;
      font-weight: 600;
    }
    nav a.active {
      background: var(--surface-2);
      color: var(--accent);
    }
    .spacer {
      flex: 1;
    }
    main {
      max-width: 72rem;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem;
    }
    .skip {
      position: absolute;
      left: -999px;
    }
    .skip:focus {
      left: 1rem;
      top: 0.5rem;
      z-index: 10;
    }
  `,
})
export class Shell {
  protected readonly nav = NAV;
  protected readonly socket = inject(AdminSocketService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  constructor() {
    this.socket.connect();
  }

  protected async logout(): Promise<void> {
    this.socket.disconnect();
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
