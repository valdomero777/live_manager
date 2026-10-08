import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { Sound } from '@tiklive/contracts';
import { AudioService } from '../../core/audio.service';
import { SoundsStore } from '../../core/sounds.store';

/** Search MyInstants through our API, preview results and pick one. No persistence here. */
@Component({
  selector: 'app-sound-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="search" role="search" (submit)="$event.preventDefault(); sounds.search(q.value)">
      <label class="sr-only" for="sound-q">Buscar sonidos</label>
      <input
        #q
        id="sound-q"
        type="text"
        maxlength="100"
        placeholder="Buscar en MyInstants, p. ej. vine boom"
        autocomplete="off"
        (input)="sounds.searchDebounced(q.value)"
      />
      <button type="submit" class="primary" [disabled]="sounds.loading()">Buscar</button>
    </form>

    @if (sounds.loading()) {
      <p class="muted" role="status">Buscando…</p>
    }
    @if (sounds.error()) {
      <p class="notice danger" role="alert">{{ sounds.error() }}</p>
    }
    @if (audio.error()) {
      <p class="notice danger" role="alert">{{ audio.error() }}</p>
    }
    @if (audio.blocked()) {
      <p class="notice warn" role="alert">
        Activa el audio para permitir la reproducción automática de triggers.
        <button type="button" (click)="audio.unlock()">Activar audio</button>
      </p>
    }

    <ul class="results">
      @for (s of sounds.results(); track s.id) {
        <li [class.selected]="s.id === selectedId()">
          <span class="icon" aria-hidden="true">🔊</span>
          <span class="title" [title]="s.title">{{ s.title }}</span>
          <button type="button" (click)="toggle(s)" [attr.aria-label]="label(s)">
            {{ audio.playingUrl() === s.audioUrl ? '■ Detener' : '▶ Reproducir' }}
          </button>
          <button type="button" class="primary" (click)="picked.emit(s)">
            {{ s.id === selectedId() ? 'Seleccionado' : 'Seleccionar' }}
          </button>
        </li>
      } @empty {
        @if (sounds.searched() && !sounds.loading() && !sounds.error()) {
          <li class="muted">Sin resultados. Prueba con otra palabra.</li>
        }
      }
    </ul>

    @if (sounds.hasNext()) {
      <button type="button" (click)="sounds.loadMore()" [disabled]="sounds.loading()">
        Cargar más
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.75rem;
    }
    .search {
      display: flex;
      gap: 0.5rem;
    }
    .results {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.4rem;
      max-height: 22rem;
      overflow: auto;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    li.selected {
      border-color: var(--accent);
    }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
  `,
})
export class SoundPicker {
  protected readonly sounds = inject(SoundsStore);
  protected readonly audio = inject(AudioService);
  readonly selectedId = input<string | undefined>(undefined);
  readonly picked = output<Sound>();

  protected label(sound: Sound): string {
    return `${this.audio.playingUrl() === sound.audioUrl ? 'Detener' : 'Reproducir'} ${sound.title}`;
  }

  protected toggle(sound: Sound): void {
    if (this.audio.playingUrl() === sound.audioUrl) this.audio.stopSound();
    else void this.audio.playSound(sound.audioUrl);
  }
}
