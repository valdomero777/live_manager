import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideLoaderCircle, LucideVolume2, LucideVolumeOff } from '@lucide/angular';
import { LiveAudioService } from '../../core/live-audio.service';
import { UiButton } from '../ui/button';
import { UiTooltip } from '../ui/tooltip';

/** Top-bar switch for the LIVE's sound, reachable from every page of the panel. */
@Component({
  selector: 'app-live-audio-toggle',
  imports: [UiButton, UiTooltip, LucideVolume2, LucideVolumeOff, LucideLoaderCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      uiButton
      size="sm"
      type="button"
      [variant]="audio.active() ? 'secondary' : 'outline'"
      data-live-audio-control
      [attr.aria-pressed]="audio.active()"
      [uiTooltip]="hint()"
      tooltipSide="bottom"
      [class.text-warning-text]="audio.state() === 'waiting' || audio.state() === 'error'"
      (click)="audio.toggle()"
    >
      @switch (audio.state()) {
        @case ('on') {
          <svg lucideVolume2 class="text-success-text" />
        }
        @case ('connecting') {
          <svg lucideLoaderCircle class="animate-spin" />
        }
        @default {
          <svg lucideVolumeOff />
        }
      }
      <span class="hidden sm:inline">{{ label() }}</span>
    </button>
  `,
})
export class LiveAudioToggle {
  protected readonly audio = inject(LiveAudioService);

  protected readonly label = computed(() => {
    switch (this.audio.state()) {
      case 'on':
        return $localize`Sonido activo`;
      case 'connecting':
        return $localize`Conectando sonido…`;
      case 'waiting':
        return $localize`Activar sonido`;
      case 'error':
        return $localize`Reintentar sonido`;
      default:
        return $localize`Sonido apagado`;
    }
  });

  protected readonly hint = computed(() => {
    switch (this.audio.state()) {
      case 'on':
        return $localize`Los sonidos y la voz del LIVE suenan en este panel. Clic para silenciar.`;
      case 'connecting':
        return $localize`Conectando con el servidor…`;
      case 'waiting':
        return $localize`El navegador necesita un clic para reproducir sonido.`;
      case 'error':
        return this.audio.error() ?? $localize`No se pudo iniciar el audio.`;
      default:
        return $localize`Clic para escuchar el LIVE en este panel.`;
    }
  });
}
