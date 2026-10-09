import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  LucideAudioLines,
  LucideCircleAlert,
  LucidePause,
  LucidePlay,
  LucideSquare,
  LucideVolume2,
  LucideVolumeX,
} from '@lucide/angular';
import { AudioService } from '../../core/audio.service';
import { UI_ALERT } from '../ui/alert';
import { UiButton } from '../ui/button';
import { UiSpinner } from '../ui/feedback';
import { UiSlider } from '../ui/input';

/**
 * The chosen sound: play / pause / stop and the volume it will have on stream. Changing the
 * volume while it plays is heard immediately. Projected content goes in the header (e.g.
 * the «Cambiar» button that opens the SoundSelector).
 */
@Component({
  selector: 'app-sound-player',
  imports: [
    UiButton,
    UiSpinner,
    UiSlider,
    ...UI_ALERT,
    LucideAudioLines,
    LucidePlay,
    LucidePause,
    LucideSquare,
    LucideVolume2,
    LucideVolumeX,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4 rounded-lg border bg-muted/50 p-4' },
  template: `
    <div class="flex items-center gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-lg bg-sound-soft text-sound-text"
        aria-hidden="true"
      >
        <svg lucideAudioLines class="size-5" [class.animate-pulse]="playing()" />
      </span>
      <div class="grid min-w-0 flex-1">
        <p class="truncate text-sm font-semibold" [title]="title()">{{ title() }}</p>
        <p class="type-caption">{{ source() }}</p>
      </div>
      <ng-content />
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div
        class="flex items-center gap-1"
        role="group"
        [attr.aria-label]="'Reproducción de ' + title()"
      >
        @if (loading()) {
          <button
            uiButton
            variant="outline"
            size="icon-sm"
            type="button"
            aria-label="Cargando sonido; pulsa para cancelar"
            (click)="audio.stopSound()"
          >
            <ui-spinner />
          </button>
        } @else if (playing()) {
          <button
            uiButton
            variant="outline"
            size="icon-sm"
            type="button"
            aria-label="Pausar"
            (click)="audio.pause()"
          >
            <svg lucidePause class="fill-current" />
          </button>
        } @else {
          <button
            uiButton
            variant="outline"
            size="icon-sm"
            type="button"
            [attr.aria-label]="paused() ? 'Reanudar' : 'Reproducir'"
            (click)="play()"
          >
            <svg lucidePlay class="fill-current" />
          </button>
        }
        <button
          uiButton
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label="Detener"
          [disabled]="!playing() && !paused()"
          (click)="audio.stopSound()"
        >
          <svg lucideSquare class="fill-current" />
        </button>
      </div>

      <div class="flex min-w-[12rem] flex-1 items-center gap-3">
        @if (volume() === 0) {
          <svg lucideVolumeX class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        } @else {
          <svg lucideVolume2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        }
        <input
          uiSlider
          type="range"
          min="0"
          max="1"
          step="0.05"
          [id]="volumeId()"
          [value]="volume()"
          [attr.aria-label]="'Volumen'"
          [attr.aria-valuetext]="percent() + '%'"
          (input)="setVolume($any($event.target).valueAsNumber)"
        />
        <output [attr.for]="volumeId()" class="w-10 text-right text-sm font-medium tabular-nums"
          >{{ percent() }}%</output
        >
      </div>
    </div>

    @if (audio.error()) {
      <div uiAlert variant="destructive" role="alert">
        <svg lucideCircleAlert />
        <p uiAlertDescription>{{ audio.error() }}</p>
      </div>
    }
  `,
})
export class SoundPlayer {
  protected readonly audio = inject(AudioService);
  readonly url = input.required<string>();
  readonly title = input.required<string>();
  readonly source = input('MyInstants');
  readonly volume = input(0.8);
  readonly volumeId = input('sound-volume');
  readonly volumeChange = output<number>();

  private readonly src = computed(() => new URL(this.url(), location.href).href);
  protected readonly playing = computed(() => this.audio.playingUrl() === this.src());
  protected readonly paused = computed(() => this.audio.pausedUrl() === this.src());
  protected readonly loading = computed(() => this.audio.loadingUrl() === this.src());
  protected readonly percent = computed(() => Math.round(this.volume() * 100));

  protected play(): void {
    if (!this.paused()) {
      void this.audio.playSound(this.src(), this.volume());
      return;
    }
    // The slider may have moved while paused: resume at the volume it shows now.
    this.audio.setVolume(this.volume());
    void this.audio.resume();
  }

  protected setVolume(volume: number): void {
    this.volumeChange.emit(volume);
    // What is playing (or paused, waiting to resume) follows the slider.
    if (this.playing() || this.paused() || this.loading()) this.audio.setVolume(volume);
  }
}
