import { Overlay, type ConnectedPosition, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  type OnDestroy,
  inject,
  input,
  signal,
} from '@angular/core';

const POSITIONS: Readonly<Record<'top' | 'right' | 'bottom', ConnectedPosition[]>> = {
  right: [
    { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 },
    { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 },
  ],
  top: [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
  ],
  bottom: [
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
  ],
};

let nextId = 0;

@Component({
  selector: 'ui-tooltip-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tooltip',
    '[id]': 'id()',
    class:
      'block max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-overlay animate-overlay-in',
  },
  template: '{{ text() }}',
})
export class UiTooltipContent {
  readonly text = signal('');
  readonly id = signal('');
}

/**
 * shadcn/ui Tooltip: shown on hover and keyboard focus, hidden with Escape, and linked to its
 * trigger with aria-describedby. Use for supplementary text only; the trigger keeps its own name.
 */
@Directive({
  selector: '[uiTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
    '[attr.aria-describedby]': 'open() ? id : null',
  },
})
export class UiTooltip implements OnDestroy {
  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private ref: OverlayRef | undefined;

  readonly text = input('', { alias: 'uiTooltip' });
  readonly side = input<'top' | 'right' | 'bottom'>('top', { alias: 'tooltipSide' });
  readonly disabled = input(false, { alias: 'tooltipDisabled' });
  protected readonly id = `ui-tooltip-${nextId++}`;
  protected readonly open = signal(false);

  protected show(): void {
    if (this.disabled() || !this.text() || this.ref?.hasAttached()) return;
    this.ref ??= this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions(POSITIONS[this.side()]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'pointer-events-none',
    });
    const content = this.ref.attach(new ComponentPortal(UiTooltipContent)).instance;
    content.text.set(this.text());
    content.id.set(this.id);
    this.open.set(true);
  }

  protected hide(): void {
    this.ref?.detach();
    this.open.set(false);
  }

  ngOnDestroy(): void {
    this.ref?.dispose();
  }
}
