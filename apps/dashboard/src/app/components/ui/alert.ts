import { Directive, computed, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const alertVariants = cva(
  [
    'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm',
    'has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  ],
  {
    variants: {
      variant: {
        default: 'bg-surface text-foreground',
        info: 'border-info/30 bg-info-soft text-info-text',
        success: 'border-success/30 bg-success-soft text-success-text',
        warning: 'border-warning/40 bg-warning-soft text-warning-text',
        destructive: 'border-danger/30 bg-danger-soft text-danger-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

/** shadcn/ui Alert. The caller sets role="alert" (errors) or role="status" (confirmations). */
@Directive({
  selector: '[uiAlert]',
  host: { '[class]': 'classes()', 'data-slot': 'alert' },
})
export class UiAlert {
  readonly variant = input<AlertVariant>('default');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(alertVariants({ variant: this.variant() }), this.userClass()),
  );
}

@Directive({
  selector: '[uiAlertTitle]',
  host: { '[class]': 'classes()', 'data-slot': 'alert-title' },
})
export class UiAlertTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('col-start-2 min-h-4 font-medium tracking-tight', this.userClass()),
  );
}

@Directive({
  selector: '[uiAlertDescription]',
  host: { '[class]': 'classes()', 'data-slot': 'alert-description' },
})
export class UiAlertDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'col-start-2 grid justify-items-start gap-1 text-sm text-foreground/80 [&_p]:leading-relaxed',
      this.userClass(),
    ),
  );
}

export const UI_ALERT = [UiAlert, UiAlertTitle, UiAlertDescription] as const;
