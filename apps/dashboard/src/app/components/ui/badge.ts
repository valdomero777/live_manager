import { Directive, computed, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5',
    'text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  ],
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success-soft text-success-text',
        warning: 'border-transparent bg-warning-soft text-warning-text',
        danger: 'border-transparent bg-danger-soft text-danger-text',
        info: 'border-transparent bg-info-soft text-info-text',
        live: 'border-transparent bg-live-soft text-live-text',
        gift: 'border-transparent bg-gift-soft text-gift-text',
        automation: 'border-transparent bg-automation-soft text-automation-text',
        sound: 'border-transparent bg-sound-soft text-sound-text',
        analytics: 'border-transparent bg-analytics-soft text-analytics-text',
        comment: 'border-transparent bg-comment-soft text-comment-text',
        follow: 'border-transparent bg-follow-soft text-follow-text',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

@Directive({
  selector: '[uiBadge]',
  host: { '[class]': 'classes()', 'data-slot': 'badge' },
})
export class UiBadge {
  readonly variant = input<BadgeVariant>('secondary');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(badgeVariants({ variant: this.variant() }), this.userClass()),
  );
}
