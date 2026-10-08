import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, type LucideIconInput } from '@lucide/angular';
import { UI_CARD } from '../ui/card';

/**
 * Card for a chart, list or breakdown: title, optional icon and description, header actions
 * (`[analyticsCardAction]`) and the body.
 */
@Component({
  selector: 'app-analytics-card',
  imports: [LucideDynamicIcon, ...UI_CARD],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <section uiCard class="h-full" [attr.aria-labelledby]="titleId()">
      <header uiCardHeader>
        <h2 uiCardTitle [id]="titleId()">
          @if (icon(); as icon) {
            <svg [lucideIcon]="icon" class="text-muted-foreground" />
          }
          {{ title() }}
        </h2>
        @if (description()) {
          <p uiCardDescription>{{ description() }}</p>
        }
        <div uiCardAction>
          <ng-content select="[analyticsCardAction]" />
        </div>
      </header>
      <div uiCardContent class="min-h-0 flex-1">
        <ng-content />
      </div>
    </section>
  `,
})
export class AnalyticsCard {
  readonly title = input.required<string>();
  readonly titleId = input.required<string>();
  readonly description = input('');
  readonly icon = input<LucideIconInput | undefined>(undefined);
}
