import {
  CdkDialogContainer,
  Dialog,
  DialogRef,
  type DialogConfig,
} from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import type { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  Injectable,
  type OnDestroy,
  type TemplateRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { LucideX } from '@lucide/angular';
import { cn } from '../../lib/utils';
import { UiButton } from './button';

const WIDTHS = { sm: '26rem', md: '32rem', lg: '42rem', xl: '56rem' } as const;
export type DialogSize = keyof typeof WIDTHS;

/**
 * shadcn/ui Dialog and Sheet on top of the Angular CDK dialog (the Radix equivalent): focus trap,
 * Escape, aria-modal, scroll blocking and focus restore come from the CDK.
 */
@Injectable({ providedIn: 'root' })
export class UiDialogService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  open<R = unknown, D = unknown, C = unknown>(
    content: ComponentType<C> | TemplateRef<C>,
    config: DialogConfig<D, DialogRef<R, C>> & { size?: DialogSize } = {},
  ): DialogRef<R, C> {
    const { size = 'md', ...rest } = config;
    return this.dialog.open<R, D, C>(content, {
      width: WIDTHS[size],
      maxWidth: 'calc(100vw - 2rem)',
      backdropClass: 'ui-dialog-backdrop',
      panelClass: 'ui-dialog-pane',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ...rest,
    });
  }

  /** Side panel (mobile navigation). */
  openSheet<C>(content: ComponentType<C> | TemplateRef<C>, ariaLabel: string): DialogRef<unknown, C> {
    return this.dialog.open(content, {
      ariaLabel,
      width: 'min(18rem, 85vw)',
      height: '100dvh',
      maxWidth: '85vw',
      positionStrategy: this.overlay.position().global().left('0').top('0'),
      backdropClass: 'ui-dialog-backdrop',
      panelClass: 'ui-sheet-pane',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}

@Component({
  selector: 'ui-dialog-content',
  imports: [UiButton, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', 'data-slot': 'dialog-content' },
  template: `
    <ng-content />
    @if (showClose() && ref) {
      <button
        uiButton
        variant="ghost"
        size="icon-sm"
        type="button"
        class="absolute top-3 right-3 text-muted-foreground"
        aria-label="Cerrar"
        (click)="ref.close()"
      >
        <svg lucideX />
      </button>
    }
  `,
})
export class UiDialogContent {
  protected readonly ref = inject(DialogRef, { optional: true });
  readonly showClose = input(true);
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'relative grid max-h-[calc(100dvh-2rem)] w-full gap-4 overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-overlay animate-overlay-in sm:p-6',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiDialogHeader]',
  host: { '[class]': 'classes()', 'data-slot': 'dialog-header' },
})
export class UiDialogHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex flex-col gap-1.5 pr-8 text-left', this.userClass()),
  );
}

let nextTitleId = 0;

/** Registers itself as the dialog's accessible name. */
@Directive({
  selector: '[uiDialogTitle]',
  host: { '[id]': 'id', '[class]': 'classes()', 'data-slot': 'dialog-title' },
})
export class UiDialogTitle implements OnDestroy {
  private readonly container = inject(CdkDialogContainer, { optional: true });
  protected readonly id = `ui-dialog-title-${nextTitleId++}`;
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('type-section-title', this.userClass()));

  constructor() {
    queueMicrotask(() => this.container?._addAriaLabelledBy(this.id));
  }

  ngOnDestroy(): void {
    this.container?._removeAriaLabelledBy(this.id);
  }
}

@Directive({
  selector: '[uiDialogDescription]',
  host: { '[class]': 'classes()', 'data-slot': 'dialog-description' },
})
export class UiDialogDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('type-secondary', this.userClass()));
}

@Directive({
  selector: '[uiDialogFooter]',
  host: { '[class]': 'classes()', 'data-slot': 'dialog-footer' },
})
export class UiDialogFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', this.userClass()),
  );
}

export const UI_DIALOG = [
  UiDialogContent,
  UiDialogHeader,
  UiDialogTitle,
  UiDialogDescription,
  UiDialogFooter,
] as const;
