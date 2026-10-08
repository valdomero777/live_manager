import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCheck,
  LucideLogOut,
  LucideMenu,
  LucideMonitor,
  LucideMoon,
  LucideSettings,
  LucideSun,
  LucideUnplug,
} from '@lucide/angular';
import { AdminSocketService } from '../../core/admin-socket.service';
import { ThemeService, type ThemePreference } from '../../core/theme.service';
import { LiveStatus } from '../live/live-status';
import { UiBadge } from '../ui/badge';
import { UiButton } from '../ui/button';
import { UI_DROPDOWN_MENU } from '../ui/dropdown-menu';
import { UiTooltip } from '../ui/tooltip';

/** Always-visible bar: TikTok connection, panel connectivity, theme and session. */
@Component({
  selector: 'app-topbar',
  imports: [
    RouterLink,
    LiveStatus,
    UiBadge,
    UiButton,
    UiTooltip,
    ...UI_DROPDOWN_MENU,
    LucideMenu,
    LucideSun,
    LucideMoon,
    LucideMonitor,
    LucideCheck,
    LucideLogOut,
    LucideSettings,
    LucideUnplug,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6',
  },
  template: `
    <button
      uiButton
      variant="ghost"
      size="icon-sm"
      type="button"
      class="-ml-1 md:hidden"
      aria-label="Abrir menú"
      (click)="openMenu.emit()"
    >
      <svg lucideMenu />
    </button>

    <a
      routerLink="/estado"
      class="min-w-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      uiTooltip="Ver conexión con TikTok"
      tooltipSide="bottom"
    >
      <app-live-status [status]="socket.connectorStatus()" />
    </a>

    @if (!socket.connected()) {
      <span uiBadge variant="warning" class="hidden sm:inline-flex" role="status">
        <svg lucideUnplug /> Panel reconectando…
      </span>
    }

    <span class="flex-1"></span>

    <button
      uiButton
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label="Tema de color"
      uiTooltip="Tema"
      tooltipSide="bottom"
      [cdkMenuTriggerFor]="themeMenu"
    >
      @if (theme.resolved() === 'dark') {
        <svg lucideMoon />
      } @else {
        <svg lucideSun />
      }
    </button>
    <ng-template #themeMenu>
      <div cdkMenu uiDropdownMenu>
        @for (option of themes; track option.value) {
          <button
            cdkMenuItemRadio
            uiDropdownMenuItem
            [cdkMenuItemChecked]="theme.preference() === option.value"
            (cdkMenuItemTriggered)="setTheme(option.value)"
          >
            @switch (option.value) {
              @case ('light') {
                <svg lucideSun />
              }
              @case ('dark') {
                <svg lucideMoon />
              }
              @default {
                <svg lucideMonitor />
              }
            }
            <span class="flex-1">{{ option.label }}</span>
            @if (theme.preference() === option.value) {
              <svg lucideCheck class="!text-foreground" />
            }
          </button>
        }
      </div>
    </ng-template>

    <button
      uiButton
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label="Cuenta"
      [cdkMenuTriggerFor]="accountMenu"
      class="rounded-full"
    >
      <span
        class="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
        aria-hidden="true"
        >TL</span
      >
    </button>
    <ng-template #accountMenu>
      <div cdkMenu uiDropdownMenu class="min-w-48">
        <p uiDropdownMenuLabel>Panel de TikLive</p>
        <a cdkMenuItem uiDropdownMenuItem routerLink="/ajustes"><svg lucideSettings /> Ajustes</a>
        <div uiDropdownMenuSeparator></div>
        <button cdkMenuItem uiDropdownMenuItem variant="destructive" (cdkMenuItemTriggered)="logout.emit()">
          <svg lucideLogOut /> Cerrar sesión
        </button>
      </div>
    </ng-template>
  `,
})
export class Topbar {
  protected readonly socket = inject(AdminSocketService);
  protected readonly theme = inject(ThemeService);
  readonly openMenu = output();
  readonly logout = output();

  protected readonly themes: readonly { value: ThemePreference; label: string }[] = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Según el sistema' },
  ];

  protected setTheme(value: ThemePreference): void {
    this.theme.set(value);
  }
}
