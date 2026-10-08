import { Directive, computed, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none',
    'transition-[color,background-color,border-color,box-shadow] outline-none',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        destructive: 'bg-danger text-white shadow-xs hover:bg-danger/90',
        outline:
          'border border-border bg-surface text-foreground shadow-xs hover:bg-surface-hover aria-pressed:bg-surface-active',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-surface-hover',
        ghost: 'text-foreground hover:bg-surface-hover aria-pressed:bg-surface-active',
        'ghost-destructive': 'text-danger-text hover:bg-danger-soft',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/** shadcn/ui Button as an attribute directive, so `<button>` and `<a>` keep their semantics. */
@Directive({
  selector: 'button[uiButton], a[uiButton], label[uiButton]',
  host: { '[class]': 'classes()', 'data-slot': 'button' },
})
export class UiButton {
  readonly variant = input<ButtonVariants['variant']>('default');
  readonly size = input<ButtonVariants['size']>('default');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(buttonVariants({ variant: this.variant(), size: this.size() }), this.userClass()),
  );
}
