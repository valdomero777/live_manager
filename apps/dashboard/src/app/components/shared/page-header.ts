import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title, one-line purpose and the page's primary actions. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between' },
  template: `
    <div class="grid min-w-0 gap-1">
      <ng-content select="[pageHeaderLead]" />
      <h1 class="type-page-title">{{ title() }}</h1>
      @if (description()) {
        <p class="max-w-3xl type-secondary">{{ description() }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
