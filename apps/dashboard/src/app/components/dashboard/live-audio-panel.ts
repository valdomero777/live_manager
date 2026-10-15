import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideVolume2, LucideVolumeOff } from '@lucide/angular';
import { LiveAudioService } from '../../core/live-audio.service';
import { EmptyState } from '../shared/empty-state';
import { UI_ALERT } from '../ui/alert';
import { UiBadge } from '../ui/badge';
import { UiButton } from '../ui/button';

/** The LIVE's sound, played by this panel: on/off, volume and what was played last. */
@Component({
  selector: 'app-live-audio-panel',
  imports: [DatePipe, EmptyState, UiBadge, UiButton, ...UI_ALERT, LucideVolume2, LucideVolumeOff],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    <div class="flex flex-wrap items-center gap-3">
      @switch (audio.state()) {
        @case ('on') {
          <span i18n uiBadge variant="success">Sonando en este panel</span>
        }
        @case ('connecting') {
          <span i18n uiBadge variant="info">Conectando…</span>
        }
        @case ('waiting') {
          <span i18n uiBadge variant="warning">Esperando un clic</span>
        }
        @case ('error') {
          <span i18n uiBadge variant="danger">Error</span>
        }
        @default {
          <span i18n uiBadge>Apagado</span>
        }
      }
      <span class="flex-1"></span>
      @if (audio.enabled() && (audio.state() === 'on' || audio.state() === 'connecting')) {
        <button
          i18n
          uiButton
          variant="outline"
          size="sm"
          type="button"
          data-live-audio-control
          (click)="audio.disable()"
        >
          <svg lucideVolumeOff /> Silenciar
        </button>
      } @else {
        <button
          i18n
          uiButton
          size="sm"
          type="button"
          data-live-audio-control
          (click)="audio.enable()"
        >
          <svg lucideVolume2 /> Activar sonido
        </button>
      }
    </div>

    @if (audio.error(); as error) {
      <div uiAlert variant="destructive" role="alert">
        <p uiAlertDescription>{{ error }}</p>
      </div>
    }

    <label class="grid gap-1.5">
      <span i18n class="flex items-center justify-between type-label">
        Volumen <span class="type-caption tabular-nums">{{ percent() }} %</span>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="w-full accent-primary"
        [value]="audio.volume()"
        (input)="audio.setVolume(+$any($event.target).value)"
      />
    </label>

    @if (audio.entries().length) {
      <ol i18n-aria-label class="grid max-h-48 overflow-y-auto" aria-label="Últimos sonidos">
        @for (e of audio.entries(); track e.id) {
          <li
            class="flex gap-3 border-b border-border-subtle py-1.5 text-sm last:border-b-0"
            [class.text-danger-text]="e.text.startsWith('Error')"
          >
            <time class="w-16 shrink-0 type-caption tabular-nums">{{
              e.at | date: 'HH:mm:ss'
            }}</time>
            <span class="min-w-0 truncate">{{ e.text }}</span>
          </li>
        }
      </ol>
    } @else {
      <app-empty-state
        i18n-description
        i18n-title
        [icon]="icons.volume"
        title="Todavía no ha sonado nada"
        description="Los sonidos y la voz de tus reglas y triggers se reproducen aquí, sin abrir otra pestaña."
      />
    }
  `,
})
export class LiveAudioPanel {
  protected readonly audio = inject(LiveAudioService);
  protected readonly icons = { volume: LucideVolume2 };

  protected percent(): number {
    return Math.round(this.audio.volume() * 100);
  }
}
