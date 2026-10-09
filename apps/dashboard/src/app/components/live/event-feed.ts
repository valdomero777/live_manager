import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, LucideRadio, LucideWifiOff } from '@lucide/angular';
import { EmptyState } from '../shared/empty-state';
import { UI_ALERT } from '../ui/alert';
import { UiSkeleton } from '../ui/feedback';
import { EVENT_META } from './event-meta';
import type { FeedItem } from './event-format';

/** Fixed row height: lets the CDK virtual scroll render only the rows on screen. */
const ROW_PX = 60;

/**
 * Realtime event feed. Virtualized, so the full 500-event buffer costs the same as 10 rows; each
 * row is one line of "who did what" plus one line of detail.
 *
 * Not an aria-live region on purpose: at live-stream rates it would read nonstop. The Events
 * page offers «Pausar» to read the list calmly.
 */
@Component({
  selector: 'app-event-feed',
  imports: [
    ScrollingModule,
    DatePipe,
    LucideDynamicIcon,
    LucideWifiOff,
    UiSkeleton,
    EmptyState,
    ...UI_ALERT,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    @if (!realtime()) {
      <div uiAlert variant="warning" class="mb-3" role="status">
        <svg lucideWifiOff />
        <p uiAlertDescription>Sin conexión en tiempo real con el servidor. Reconectando…</p>
      </div>
    }
    @if (error()) {
      <div uiAlert variant="destructive" role="alert">
        <p uiAlertDescription>{{ error() }}</p>
      </div>
    } @else if (loading() && !items().length) {
      <div class="grid gap-3 px-1" aria-busy="true" aria-label="Cargando eventos">
        @for (i of skeletonRows; track i) {
          <div class="flex items-center gap-3">
            <div uiSkeleton class="size-8 rounded-full"></div>
            <div class="grid flex-1 gap-1.5">
              <div uiSkeleton class="h-3.5 w-2/3"></div>
              <div uiSkeleton class="h-3 w-1/3"></div>
            </div>
          </div>
        }
      </div>
    } @else if (!items().length) {
      <app-empty-state
        [icon]="emptyIcon"
        [title]="emptyTitle()"
        [description]="emptyDescription()"
        [bordered]="false"
      />
    } @else {
      <cdk-virtual-scroll-viewport
        [itemSize]="rowPx"
        [minBufferPx]="rowPx * 6"
        [maxBufferPx]="rowPx * 12"
        class="scrollbar-thin"
        [style.height]="height()"
      >
        <ol [attr.aria-label]="label()" class="m-0 list-none p-0">
          <li
            *cdkVirtualFor="let item of items(); trackBy: trackById"
            class="flex h-[60px] animate-event-in items-center gap-3 border-b border-border-subtle px-1 last:border-b-0"
          >
            @let meta = eventMeta[item.type];
            <span
              [class]="meta.tone"
              class="grid size-8 shrink-0 place-items-center rounded-full"
              [title]="meta.label"
            >
              <svg [lucideIcon]="meta.icon" class="size-4" />
              <span class="sr-only">{{ meta.label }}:</span>
            </span>
            <div class="grid min-w-0 flex-1 gap-0.5">
              <p class="truncate text-sm" [title]="item.detail || item.action">
                @if (item.nickname) {
                  <span class="font-medium">{{ item.nickname }}</span>
                  <span class="text-muted-foreground"> {{ item.action }}</span>
                } @else {
                  <span class="font-medium">{{ item.action }}</span>
                }
              </p>
              @if (item.user || item.detail) {
                <p class="truncate type-caption">
                  {{ item.user }}{{ item.user && item.detail ? ' · ' : '' }}{{ item.detail }}
                </p>
              }
            </div>
            <time
              class="shrink-0 type-caption tabular-nums"
              [attr.datetime]="item.at | date: 'yyyy-MM-ddTHH:mm:ss'"
              >{{ item.at | date: 'HH:mm:ss' }}</time
            >
          </li>
        </ol>
      </cdk-virtual-scroll-viewport>
    }
  `,
})
export class EventFeed {
  readonly items = input.required<readonly FeedItem[]>();
  readonly loading = input(false);
  readonly error = input<string | undefined>();
  /** False while the panel's websocket is down. */
  readonly realtime = input(true);
  readonly height = input('24rem');
  readonly label = input('Eventos en vivo');
  readonly emptyTitle = input('Aún no llegan eventos');
  readonly emptyDescription = input(
    'Inicia tu live o usa el Simulador para ver la actividad aquí.',
  );

  protected readonly rowPx = ROW_PX;
  protected readonly eventMeta = EVENT_META;
  protected readonly emptyIcon = LucideRadio;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly trackById = (_: number, item: FeedItem) => item.id;
}
