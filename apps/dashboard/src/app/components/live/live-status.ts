import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ConnectorStatus } from '@tiklive/contracts';
import { cn } from '../../lib/utils';
import { liveStateOf, type LiveTone } from './live-state';

const DOT: Readonly<Record<LiveTone, string>> = {
  neutral: 'bg-muted-foreground/60 text-muted-foreground',
  info: 'bg-info text-info',
  success: 'bg-success text-success',
  live: 'bg-live text-live',
  warning: 'bg-warning text-warning',
  danger: 'bg-danger text-danger',
};

const PILL: Readonly<Record<LiveTone, string>> = {
  neutral: 'bg-surface-active text-muted-foreground',
  info: 'bg-info-soft text-info-text',
  success: 'bg-success-soft text-success-text',
  live: 'bg-live text-white',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
};

/**
 * TikTok connection state, visible but quiet: a dot + label in the top bar (`compact`) or a
 * label with an explanation (`full`). Announces changes politely to screen readers.
 */
@Component({
  selector: 'app-live-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <div class="flex min-w-0 items-center gap-2.5" role="status" aria-live="polite">
      <span [class]="pillClass()" [attr.data-state]="view().state">
        <span [class]="dotClass()" aria-hidden="true"></span>
        {{ view().label }}
      </span>
      @if (variant() === 'full') {
        <span class="truncate type-secondary" [title]="view().hint">{{ view().hint }}</span>
      } @else {
        <span class="sr-only">{{ view().hint }}</span>
      }
    </div>
  `,
})
export class LiveStatus {
  readonly status = input<ConnectorStatus | undefined>();
  readonly variant = input<'compact' | 'full'>('compact');

  protected readonly view = computed(() => liveStateOf(this.status()));
  protected readonly pillClass = computed(() =>
    cn(
      'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
      this.view().state === 'live' && 'tracking-wider',
      PILL[this.view().tone],
    ),
  );
  protected readonly dotClass = computed(() => {
    const live = this.view().state === 'live';
    return cn(
      'size-2 shrink-0 rounded-full',
      live ? 'bg-white text-white' : DOT[this.view().tone],
      this.view().pulse && 'animate-live-pulse',
    );
  });
}
