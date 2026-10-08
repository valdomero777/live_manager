import { Directive, ElementRef, type DoCheck, computed, inject, input } from '@angular/core';
import { cn } from '../../lib/utils';

const CONTROL = [
  'w-full min-w-0 rounded-md border border-input bg-surface text-sm text-foreground shadow-xs',
  'transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-danger aria-invalid:ring-danger/20',
].join(' ');

/** Text, number, search and password inputs. */
@Directive({
  selector: 'input[uiInput]',
  host: { '[class]': 'classes()', 'data-slot': 'input' },
})
export class UiInput {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(CONTROL, 'h-9 px-3 py-1 [&::-webkit-search-cancel-button]:cursor-pointer', this.userClass()),
  );
}

@Directive({
  selector: 'textarea[uiTextarea]',
  host: { '[class]': 'classes()', 'data-slot': 'textarea' },
})
export class UiTextarea {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(CONTROL, 'field-sizing-content min-h-24 px-3 py-2', this.userClass()),
  );
}

/** shadcn/ui NativeSelect: the real <select>, so keyboard, mobile pickers and forms just work. */
@Directive({
  selector: 'select[uiNativeSelect]',
  host: { '[class]': 'classes()', 'data-slot': 'native-select' },
})
export class UiNativeSelect {
  readonly size = input<'default' | 'sm'>('default');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      CONTROL,
      'ui-native-select cursor-pointer pl-3',
      this.size() === 'sm' ? 'h-8 text-xs' : 'h-9',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'label[uiLabel], legend[uiLabel], span[uiLabel]',
  host: { '[class]': 'classes()', 'data-slot': 'label' },
})
export class UiLabel {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'flex items-center gap-2 type-label leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'input[type=checkbox][uiCheckbox], input[type=radio][uiCheckbox]',
  host: {
    '[class]': 'classes()',
    'data-slot': 'checkbox',
  },
})
export class UiCheckbox {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'ui-checkbox peer focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none',
      this.userClass(),
    ),
  );
}

/** Native range input styled as shadcn/ui Slider; paints the filled part of the track. */
@Directive({
  selector: 'input[type=range][uiSlider]',
  host: {
    '[class]': 'classes()',
    'data-slot': 'slider',
    '(input)': 'paint()',
  },
})
export class UiSlider implements DoCheck {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'ui-slider rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none',
      this.userClass(),
    ),
  );

  ngDoCheck(): void {
    this.paint();
  }

  protected paint(): void {
    const min = Number(this.el.min || 0);
    const max = Number(this.el.max || 100);
    const ratio = max > min ? (Number(this.el.value) - min) / (max - min) : 0;
    this.el.style.setProperty('--fill', `${Math.round(ratio * 1000) / 10}%`);
  }
}

export const UI_FORM = [
  UiInput,
  UiTextarea,
  UiNativeSelect,
  UiLabel,
  UiCheckbox,
  UiSlider,
] as const;
