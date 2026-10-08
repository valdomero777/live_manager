import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import {
  LucideCircleAlert,
  LucideCircleCheck,
  LucideInfo,
  LucideTriangleAlert,
  LucideX,
} from '@lucide/angular';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  readonly id: number;
  readonly variant: ToastVariant;
  readonly title: string;
  readonly description?: string;
}

const DURATION_MS = 4_500;
const MAX_VISIBLE = 4;

/**
 * Sonner-style notifications for results of an action (saved, deleted, sent). Form validation
 * errors are never shown only here: they stay next to the field.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<readonly Toast[]>([]);

  success(title: string, description?: string): void {
    this.show('success', title, description);
  }

  error(title: string, description?: string): void {
    this.show('error', title, description);
  }

  warning(title: string, description?: string): void {
    this.show('warning', title, description);
  }

  info(title: string, description?: string): void {
    this.show('info', title, description);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(variant: ToastVariant, title: string, description?: string): void {
    const toast: Toast = { id: this.nextId++, variant, title, description };
    this.toasts.update((list) => [...list, toast].slice(-MAX_VISIBLE));
    const duration = variant === 'error' ? DURATION_MS * 2 : DURATION_MS;
    setTimeout(() => this.dismiss(toast.id), duration);
  }
}

const TONES: Readonly<Record<ToastVariant, string>> = {
  success: 'text-success-text',
  error: 'text-danger-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
};

@Component({
  selector: 'ui-toaster',
  imports: [LucideCircleCheck, LucideCircleAlert, LucideTriangleAlert, LucideInfo, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'pointer-events-none fixed inset-x-4 bottom-4 z-[1100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6',
  },
  template: `
    <section aria-label="Notificaciones" class="contents">
      @for (t of service.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-overlay animate-toast-in sm:w-[22rem]"
          [attr.role]="t.variant === 'error' ? 'alert' : 'status'"
        >
          <span [class]="tones[t.variant]" class="mt-0.5 shrink-0">
            @switch (t.variant) {
              @case ('success') {
                <svg lucideCircleCheck class="size-4" />
              }
              @case ('error') {
                <svg lucideCircleAlert class="size-4" />
              }
              @case ('warning') {
                <svg lucideTriangleAlert class="size-4" />
              }
              @default {
                <svg lucideInfo class="size-4" />
              }
            }
          </span>
          <div class="grid min-w-0 flex-1 gap-0.5">
            <p class="text-sm font-medium">{{ t.title }}</p>
            @if (t.description) {
              <p class="type-secondary break-words">{{ t.description }}</p>
            }
          </div>
          <button
            type="button"
            class="-m-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            aria-label="Cerrar notificación"
            (click)="service.dismiss(t.id)"
          >
            <svg lucideX class="size-3.5" />
          </button>
        </div>
      }
    </section>
  `,
})
export class UiToaster {
  protected readonly service = inject(ToastService);
  protected readonly tones = TONES;
}
