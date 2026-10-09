import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, type LucideIconInput } from '@lucide/angular';
import { cn } from '../../lib/utils';

export type StepKind = 'when' | 'if' | 'then';

const STEPS: Readonly<Record<StepKind, { overline: string; tone: string }>> = {
  when: { overline: 'Cuando', tone: 'bg-live-soft text-live-text' },
  if: { overline: 'Si', tone: 'bg-info-soft text-info-text' },
  then: { overline: 'Entonces', tone: 'bg-automation-soft text-automation-text' },
};

/**
 * One step of the WHEN → IF → THEN flow. Steps stack with a connector line so the automation
 * reads top to bottom like a sentence.
 */
@Component({
  selector: 'app-automation-step',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'group/step relative grid grid-cols-[1.75rem_1fr] gap-x-2.5 sm:grid-cols-[2.25rem_1fr] sm:gap-x-4',
  },
  template: `
    <div class="flex flex-col items-center">
      <span [class]="badgeClass()" aria-hidden="true">
        <svg [lucideIcon]="icon()" class="size-4" />
      </span>
      @if (!last()) {
        <span class="mt-2 w-px flex-1 bg-border" aria-hidden="true"></span>
      }
    </div>
    <section class="min-w-0" [class.pb-8]="!last()" [attr.aria-labelledby]="headingId()">
      <div class="mb-3 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        <div class="grid">
          <span class="type-overline text-muted-foreground">{{ step().overline }}</span>
          <h2 class="type-card-title" [id]="headingId()">{{ title() }}</h2>
        </div>
        <span class="flex-1"></span>
        <ng-content select="[stepAction]" />
      </div>
      @if (description()) {
        <p class="-mt-2 mb-3 type-secondary">{{ description() }}</p>
      }
      <ng-content />
    </section>
  `,
})
export class AutomationStep {
  readonly kind = input.required<StepKind>();
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input.required<LucideIconInput>();
  readonly last = input(false);

  protected readonly step = computed(() => STEPS[this.kind()]);
  protected readonly headingId = computed(() => `step-${this.kind()}-title`);
  protected readonly badgeClass = computed(() =>
    cn(
      'grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-background sm:size-9 [&_svg]:size-3.5 sm:[&_svg]:size-4',
      this.step().tone,
    ),
  );
}
