import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { LucideTriangleAlert } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { UiButton } from './button';
import { UI_DIALOG, UiDialogService } from './dialog';

export interface ConfirmOptions {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Red confirm button and warning icon, for actions that delete or reset data. */
  readonly destructive?: boolean;
}

/** shadcn/ui AlertDialog: role="alertdialog", focus starts on «Cancelar». */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [UiButton, LucideTriangleAlert, ...UI_DIALOG],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-content [showClose]="false">
      <div uiDialogHeader class="flex-row items-start gap-3 pr-0">
        @if (data.destructive) {
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger-text"
          >
            <svg lucideTriangleAlert class="size-4" />
          </span>
        }
        <div class="grid gap-1.5">
          <h2 uiDialogTitle>{{ data.title }}</h2>
          <p uiDialogDescription>{{ data.description }}</p>
        </div>
      </div>
      <div uiDialogFooter>
        <button uiButton variant="outline" type="button" (click)="ref.close(false)" cdkFocusInitial>
          {{ data.cancelLabel ?? 'Cancelar' }}
        </button>
        <button
          uiButton
          type="button"
          [variant]="data.destructive ? 'destructive' : 'default'"
          (click)="ref.close(true)"
        >
          {{ data.confirmLabel ?? 'Continuar' }}
        </button>
      </div>
    </ui-dialog-content>
  `,
})
export class UiConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
}

/** Accessible replacement for window.confirm(). Resolves false when dismissed. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialogs = inject(UiDialogService);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialogs.open<boolean, ConfirmOptions, UiConfirmDialog>(UiConfirmDialog, {
      data: options,
      role: 'alertdialog',
      size: 'sm',
      autoFocus: 'first-tabbable',
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
