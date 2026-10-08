import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { SimulatorTemplateInput } from '@tiklive/contracts';
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
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './simulator.page.html',
  styles: `
    :host {
      display: grid;
      gap: 1.25rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
      gap: 1.25rem;
    }
    .grid > * {
      align-content: start;
    }
    .field {
      display: grid;
      gap: 0.3rem;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
    }
  `,
})
export class SimulatorPage {
  private readonly api = inject(ApiClient);
  protected readonly busy = signal(false);
  protected readonly status = signal<{ ok: boolean; text: string } | undefined>(undefined);

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

  protected endStream(): Promise<void> {
    return confirm(
      'Se cerrará la sesión actual (los rankings de «Este live» empezarán de cero). ¿Continuar?',
    )
      ? this.emit([{ kind: 'streamEnd' }])
      : Promise.resolve();
  }

  /** "Prueba completa" (spec 13): gift, likes, comment and follow in one click. */
  protected fullTest(): Promise<void> {
    return this.emit(FULL_TEST);
  }

  private async emit(templates: readonly SimulatorTemplateInput[]): Promise<void> {
    this.busy.set(true);
    try {
      let emitted = 0;
      for (const t of templates) {
        emitted += (await this.api.post<{ emitted: number }>('/simulator/emit', t)).emitted;
      }
      this.status.set({
        ok: true,
        text: `Enviado: ${emitted} mensaje(s). Mira Eventos y la pestaña de audio.`,
      });
    } catch (e) {
      this.status.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(false);
    }
  }
}
