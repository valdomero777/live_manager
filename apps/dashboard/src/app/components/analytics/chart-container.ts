import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideChartColumn } from '@lucide/angular';
import { EmptyState } from '../shared/empty-state';
import { UiSkeleton } from '../ui/feedback';

export interface ChartSeries {
  readonly key: string;
  readonly label: string;
  /** Background utility for the series color, e.g. "bg-gift". */
  readonly color: string;
}

/**
 * Frame shared by every chart: fixed height (no layout jump), legend, and the loading and
 * empty states. The chart itself is projected and must provide its own text alternative.
 */
@Component({
  selector: 'app-chart-container',
  imports: [EmptyState, UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="relative" [style.height]="height()">
      @if (loading()) {
        <div uiSkeleton class="size-full rounded-lg"></div>
      } @else if (empty()) {
        <app-empty-state
          class="h-full"
          [icon]="emptyIcon"
          [title]="emptyTitle()"
          [description]="emptyDescription()"
        />
      } @else {
        <ng-content />
      }
    </div>
    @if (series().length) {
      <ul class="flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda">
        @for (s of series(); track s.key) {
          <li class="flex items-center gap-1.5 type-caption">
            <span [class]="s.color" class="size-2.5 rounded-sm" aria-hidden="true"></span>
            {{ s.label }}
          </li>
        }
      </ul>
    }
  `,
})
export class ChartContainer {
  readonly height = input('12rem');
  readonly series = input<readonly ChartSeries[]>([]);
  readonly loading = input(false);
  readonly empty = input(false);
  readonly emptyTitle = input('Sin datos en este período');
  readonly emptyDescription = input('');
  protected readonly emptyIcon = LucideChartColumn;
}
