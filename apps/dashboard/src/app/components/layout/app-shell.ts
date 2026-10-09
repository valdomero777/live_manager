import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AdminSocketService } from '../../core/admin-socket.service';
import { AuthStore } from '../../core/auth.store';
import { UiDialogService } from '../ui/dialog';
import { UiToaster } from '../ui/toast';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const COLLAPSED_KEY = 'tiklive.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Frame for signed-in pages: sidebar (rail on desktop, sheet on mobile), top bar with the LIVE
 * state, and the page. Opens the admin websocket for every page below it.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Topbar, UiToaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh' },
  template: `
    <a
      href="#contenido"
      class="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
      >Saltar al contenido</a
    >

    <aside
      class="sticky top-0 hidden h-dvh shrink-0 border-r transition-[width] duration-200 md:block"
      [class.w-64]="!collapsed()"
      [class.w-16]="collapsed()"
    >
      <app-sidebar [collapsed]="collapsed()" (toggle)="toggleCollapsed()" />
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <app-topbar (openMenu)="openMobileNav()" (logout)="logout()" />
      <main
        id="contenido"
        tabindex="-1"
        class="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-8"
      >
        <router-outlet />
      </main>
    </div>

    <ng-template #mobileNav>
      <app-sidebar
        class="border-r shadow-overlay"
        [collapsible]="false"
        (navigate)="closeMobileNav()"
      />
    </ng-template>

    <ui-toaster />
  `,
})
export class AppShell {
  protected readonly socket = inject(AdminSocketService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly dialogs = inject(UiDialogService);
  private readonly mobileNav = viewChild.required<TemplateRef<unknown>>('mobileNav');
  private sheet: DialogRef | undefined;

  protected readonly collapsed = signal(readCollapsed());

  constructor() {
    this.socket.connect();
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed() ? '1' : '0');
    } catch {
      // storage blocked: the preference lasts for this visit
    }
  }

  protected openMobileNav(): void {
    this.sheet = this.dialogs.openSheet(this.mobileNav(), 'Menú principal');
  }

  protected closeMobileNav(): void {
    this.sheet?.close();
  }

  protected async logout(): Promise<void> {
    this.socket.disconnect();
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
