import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  LucideCircleAlert,
  LucideCircleStop,
  LucideDynamicIcon,
  LucideRocket,
  LucideSend,
} from '@lucide/angular';
import type { SimulatorTemplateInput } from '@tiklive/contracts';
import { EVENT_META } from '../../components/live/event-meta';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput, UiNativeSelect } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { ToastService } from '../../components/ui/toast';
import { ApiClient } from '../../core/api-client';
import { errorMessage } from '../../lib/labels';

const FULL_TEST: readonly SimulatorTemplateInput[] = [
  { kind: 'gift', user: 'prueba', giftName: 'Rose', diamonds: 1, quantity: 5, streak: true },
  { kind: 'like', user: 'prueba', count: 100 },
  { kind: 'comment', user: 'prueba', text: '!di hola, esto es una prueba' },
  { kind: 'follow', user: 'prueba' },
];

/**
 * Synthetic events through the same pipeline as a real live (RF-04): rehearse rules, audio and
 * overlays before going live.
 */
@Component({
  selector: 'app-simulator-page',
  imports: [
    ReactiveFormsModule,
    PageHeader,
    UiButton,
    UiInput,
    UiNativeSelect,
    UiFormField,
    UiSwitch,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    LucideDynamicIcon,
    LucideRocket,
    LucideSend,
    LucideCircleStop,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  templateUrl: './simulator.page.html',
})
export class SimulatorPage {
  private readonly api = inject(ApiClient);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly meta = EVENT_META;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly gift = new FormGroup({
    user: new FormControl('ana', { nonNullable: true }),
    giftName: new FormControl('Rose', { nonNullable: true }),
    diamonds: new FormControl(1, { nonNullable: true }),
    quantity: new FormControl(10, { nonNullable: true }),
    streak: new FormControl(true, { nonNullable: true }),
  });
  protected readonly comment = new FormGroup({
    user: new FormControl('leo', { nonNullable: true }),
    text: new FormControl('!di hola a todos', { nonNullable: true }),
  });
  protected readonly likes = new FormGroup({
    user: new FormControl('sofia', { nonNullable: true }),
    count: new FormControl(50, { nonNullable: true }),
  });
  protected readonly social = new FormGroup({
    user: new FormControl('marco', { nonNullable: true }),
    kind: new FormControl<'follow' | 'join' | 'share'>('follow', { nonNullable: true }),
  });
  protected readonly viewers = new FormControl(120, { nonNullable: true });

  protected sendGift(): Promise<void> {
    return this.emit([{ kind: 'gift', ...this.gift.getRawValue() }]);
  }

  protected sendComment(): Promise<void> {
    return this.emit([{ kind: 'comment', ...this.comment.getRawValue() }]);
  }

  protected sendLikes(): Promise<void> {
    return this.emit([{ kind: 'like', ...this.likes.getRawValue() }]);
  }

  protected sendSocial(): Promise<void> {
    return this.emit([this.social.getRawValue()]);
  }

  protected sendViewers(): Promise<void> {
    return this.emit([{ kind: 'viewerCount', viewers: this.viewers.value }]);
  }

  protected async endStream(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: '¿Terminar el live simulado?',
      description: 'Se cerrará la sesión actual y los rankings de «Este live» empezarán de cero.',
      confirmLabel: 'Terminar live',
      destructive: true,
    });
    if (ok) await this.emit([{ kind: 'streamEnd' }]);
  }

  /** "Prueba completa" (spec 13): gift, likes, comment and follow in one click. */
  protected fullTest(): Promise<void> {
    return this.emit(FULL_TEST);
  }

  private async emit(templates: readonly SimulatorTemplateInput[]): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      let emitted = 0;
      for (const t of templates) {
        emitted += (await this.api.post<{ emitted: number }>('/simulator/emit', t)).emitted;
      }
      this.toast.success(
        `Enviado: ${emitted} mensaje(s)`,
        'Míralo en Eventos y en la pestaña de audio.',
      );
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
