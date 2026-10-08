import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucidePlay, LucideSquare } from '@lucide/angular';
import { AudioService } from '../../core/audio.service';
import { UiButton, type ButtonVariants } from '../ui/button';
import { UiSpinner } from '../ui/feedback';

/** The browser reports audio.src as an absolute URL; compare like with like. */
function absolute(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

/**
 * Play/stop toggle for one sound. Presentation only: playback state lives in AudioService, so
 * starting another preview stops this one everywhere on the page.
 */
@Component({
  selector: 'app-sound-preview',
  imports: [UiButton, UiSpinner, LucidePlay, LucideSquare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      uiButton
      type="button"
      [variant]="variant()"
      [size]="showLabel() ? 'sm' : 'icon-sm'"
      [attr.aria-label]="(playing() ? 'Detener ' : 'Reproducir ') + title()"
      [attr.aria-pressed]="playing()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      @if (loading()) {
        <ui-spinner />
      } @else if (playing()) {
        <svg lucideSquare class="fill-current" />
      } @else {
        <svg lucidePlay class="fill-current" />
      }
      @if (showLabel()) {
        {{ playing() ? 'Detener' : label() }}
      }
    </button>
  `,
})
export class SoundPreview {
  private readonly audio = inject(AudioService);
  readonly url = input.required<string>();
  readonly title = input('sonido');
  readonly volume = input<number | undefined>(undefined);
  readonly label = input('Probar');
  readonly showLabel = input(false);
  readonly disabled = input(false);
  readonly variant = input<ButtonVariants['variant']>('outline');

  private readonly src = computed(() => absolute(this.url()));
  protected readonly playing = computed(() => this.audio.playingUrl() === this.src());
  protected readonly loading = computed(() => this.audio.loadingUrl() === this.src());

  protected toggle(): void {
    if (this.playing()) this.audio.stopSound();
    else void this.audio.playSound(this.src(), this.volume());
  }
}
