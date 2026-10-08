import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/utils';

/** shadcn/ui Table on native table elements. Wrap in a div with overflow-x-auto. */
@Directive({ selector: 'table[uiTable]', host: { '[class]': 'classes()', 'data-slot': 'table' } })
export class UiTable {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('w-full caption-bottom border-collapse text-sm', this.userClass()),
  );
}

@Directive({ selector: 'thead[uiTableHeader]', host: { '[class]': 'classes()' } })
export class UiTableHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('[&_tr]:border-b', this.userClass()));
}

@Directive({ selector: 'tbody[uiTableBody]', host: { '[class]': 'classes()' } })
export class UiTableBody {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('[&_tr:last-child]:border-0', this.userClass()),
  );
}

@Directive({ selector: 'tr[uiTableRow]', host: { '[class]': 'classes()' } })
export class UiTableRow {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('border-b border-border-subtle transition-colors hover:bg-surface-hover/60', this.userClass()),
  );
}

@Directive({ selector: 'th[uiTableHead]', host: { '[class]': 'classes()' } })
export class UiTableHead {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
      this.userClass(),
    ),
  );
}

@Directive({ selector: 'td[uiTableCell]', host: { '[class]': 'classes()' } })
export class UiTableCell {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('px-3 py-2.5 align-middle', this.userClass()));
}

export const UI_TABLE = [
  UiTable,
  UiTableHeader,
  UiTableBody,
  UiTableRow,
  UiTableHead,
  UiTableCell,
] as const;
