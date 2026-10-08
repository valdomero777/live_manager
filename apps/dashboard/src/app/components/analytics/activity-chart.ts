import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActivityBucket } from '../live/event-format';
import { UiTooltip } from '../ui/tooltip';
import type { ChartSeries } from './chart-container';

type SeriesKey = 'gifts' | 'likes' | 'comments' | 'social';

export const ACTIVITY_SERIES: readonly (ChartSeries & { key: SeriesKey })[] = [
  { key: 'gifts', label: 'Regalos', color: 'bg-gift' },
  { key: 'comments', label: 'Comentarios', color: 'bg-comment' },
  { key: 'likes', label: 'Likes', color: 'bg-live' },
  { key: 'social', label: 'Seguidores, entradas y compartidos', color: 'bg-follow' },
];

function total(b: ActivityBucket): number {
  return b.gifts + b.likes + b.comments + b.social;
}

/**
 * Stacked bars of interactions per minute. Plain DOM (no chart library): ~15 columns, cheap to
 * re-render on every event. A visually hidden table carries the same data for screen readers.
 */
@Component({
  selector: 'app-activity-chart',
  imports: [DatePipe, UiTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 items-end gap-1 border-b pb-px sm:gap-1.5" aria-hidden="true">
      @for (b of buckets(); track b.start) {
        <div
          class="group flex h-full min-w-0 flex-1 cursor-default flex-col justify-end rounded-t-sm hover:bg-surface-hover"
          [uiTooltip]="tooltip(b)"
          tooltipSide="top"
        >
          <div
            class="flex flex-col-reverse overflow-hidden rounded-t-sm transition-[height] duration-300"
            [style.height.%]="(total(b) / max()) * 100"
          >
            @for (s of series; track s.key) {
              @if (b[s.key]) {
                <div [class]="s.color" [style.flex-grow]="b[s.key]" class="min-h-px"></div>
              }
            }
          </div>
        </div>
      }
    </div>
    <div class="flex justify-between pt-1.5 type-caption tabular-nums" aria-hidden="true">
      <span>{{ buckets()[0]?.start | date: 'HH:mm' }}</span>
      <span>ahora</span>
    </div>
    <table class="sr-only">
      <caption>
        Interacciones por minuto
      </caption>
      <thead>
        <tr>
          <th scope="col">Minuto</th>
          @for (s of series; track s.key) {
            <th scope="col">{{ s.label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (b of buckets(); track b.start) {
          <tr>
            <th scope="row">{{ b.start | date: 'HH:mm' }}</th>
            @for (s of series; track s.key) {
              <td>{{ b[s.key] }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ActivityChart {
  readonly buckets = input.required<readonly ActivityBucket[]>();
  protected readonly series = ACTIVITY_SERIES;
  protected readonly total = total;
  protected readonly max = computed(() => Math.max(1, ...this.buckets().map(total)));

  protected tooltip(b: ActivityBucket): string {
    const time = new Date(b.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const parts = ACTIVITY_SERIES.filter((s) => b[s.key] > 0).map((s) => `${b[s.key]} ${s.label.toLowerCase()}`);
    return `${time} · ${parts.length ? parts.join(', ') : 'sin actividad'}`;
  }
}
