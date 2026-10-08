import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, type LucideIconInput } from '@lucide/angular';
import { cn } from '../../lib/utils';
import { UI_CARD } from '../ui/card';
import { UiSkeleton } from '../ui/feedback';

export type MetricTone = 'live' | 'gift' | 'automation' | 'sound' | 'analytics' | 'follow';

const TONES: Readonly<Record<MetricTone, string>> = {
  live: 'bg-live-soft text-live-text',
  gift: 'bg-gift-soft text-gift-text',
  automation: 'bg-automation-soft text-automation-text',
  sound: 'bg-sound-soft text-sound-text',
  analytics: 'bg-analytics-soft text-analytics-text',
  follow: 'bg-follow-soft text-follow-text',
};

const COMPACT_FROM = 100_000;

/** 1.245 → "1.245"; 124.500 → "124,5 mil". Big LIVE numbers stay readable at a glance. */
export function formatMetric(value: number): string {
  if (Math.abs(value) < COMPACT_FROM) return value.toLocaleString('es');
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * One number that matters during a LIVE. The value is the visual anchor; the label explains it.
 * `value === null` means the backend has no data for it yet (never a made-up zero).
 */
@Component({
  selector: 'app-metric-card',
  imports: [LucideDynamicIcon, UiSkeleton, ...UI_CARD],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <section uiCard class="h-full gap-3" [attr.aria-label]="label()">
      <div uiCardContent class="flex items-start justify-between gap-3">
        <p class="type-label text-muted-foreground">{{ label() }}</p>
        <span [class]="iconClass()" aria-hidden="true">
          <svg [lucideIcon]="icon()" class="size-4" />
        </span>
      </div>
      <div uiCardContent class="grid gap-1">
        @if (loading()) {
          <div uiSkeleton class="h-9 w-24"></div>
          <div uiSkeleton class="h-3.5 w-32"></div>
        } @else {
          <p class="type-metric" [class.text-muted-foreground]="value() === null">
            {{ display() }}
          </p>
          <p class="min-h-4 type-caption">{{ value() === null ? emptyHint() : hint() }}</p>
        }
      </div>
    </section>
  `,
})
export class MetricCard {
  readonly label = input.required<string>();
  readonly value = input<number | null>(null);
  readonly icon = input.required<LucideIconInput>();
  readonly tone = input<MetricTone>('analytics');
  readonly hint = input('');
  readonly emptyHint = input('Sin datos todavía');
  readonly loading = input(false);

  protected readonly display = computed(() => {
    const value = this.value();
    return value === null ? '—' : formatMetric(value);
  });
  protected readonly iconClass = computed(() =>
    cn('grid size-8 shrink-0 place-items-center rounded-lg', TONES[this.tone()]),
  );
}
