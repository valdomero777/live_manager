import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  LucideCheck,
  LucideCircleAlert,
  LucideMusic,
  LucideSearch,
  LucideSearchX,
  LucideVolumeX,
} from '@lucide/angular';
import type { Sound } from '@tiklive/contracts';
import { AudioService } from '../../core/audio.service';
import { SoundsStore } from '../../core/sounds.store';
import { EmptyState } from '../shared/empty-state';
import { UI_ALERT } from '../ui/alert';
import { UiButton, type ButtonVariants } from '../ui/button';
import { UI_DIALOG, UiDialogService } from '../ui/dialog';
import { UiSkeleton, UiSpinner } from '../ui/feedback';
import { UiInput } from '../ui/input';
import { SoundPreview } from './sound-preview';

/**
 * Search MyInstants (through our API: SoundsStore), preview and pick a sound, in a dialog.
 * The search logic is untouched; this is only its presentation.
 */
@Component({
  selector: 'app-sound-selector',
  imports: [
    UiButton,
    UiInput,
    UiSkeleton,
    UiSpinner,
    EmptyState,
    SoundPreview,
    ...UI_DIALOG,
    ...UI_ALERT,
    LucideMusic,
    LucideSearch,
    LucideCheck,
    LucideCircleAlert,
    LucideVolumeX,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button uiButton type="button" [variant]="variant()" [size]="size()" (click)="open()">
      <svg lucideMusic /> {{ buttonLabel() }}
    </button>

    <ng-template #dialog>
      <ui-dialog-content class="gap-5">
        <header uiDialogHeader>
          <h2 uiDialogTitle>Elegir sonido</h2>
          <p uiDialogDescription>
            Busca en MyInstants. El sonido se reproduce desde MyInstants: no se descarga.
          </p>
        </header>

        <form
          class="flex gap-2"
          role="search"
          (submit)="$event.preventDefault(); sounds.search(q.value)"
        >
          <div class="relative flex-1">
            <svg
              lucideSearch
              class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <label class="sr-only" for="sound-q">Buscar sonidos</label>
            <input
              #q
              uiInput
              id="sound-q"
              type="search"
              class="pl-9"
              maxlength="100"
              placeholder="p. ej. vine boom, aplausos, air horn"
              autocomplete="off"
              (input)="sounds.searchDebounced(q.value)"
            />
          </div>
          <button uiButton type="submit" [disabled]="sounds.loading()">Buscar</button>
        </form>

        @if (audio.blocked()) {
          <div uiAlert variant="warning" role="alert">
            <svg lucideVolumeX />
            <p uiAlertTitle>El navegador bloqueó el audio</p>
            <div uiAlertDescription>
              <p>Actívalo para poder escuchar las vistas previas.</p>
              <button uiButton size="sm" variant="outline" type="button" (click)="audio.unlock()">
                Activar audio
              </button>
            </div>
          </div>
        }
        @if (sounds.error()) {
          <div uiAlert variant="destructive" role="alert">
            <svg lucideCircleAlert />
            <p uiAlertDescription>{{ sounds.error() }}</p>
          </div>
        }
        @if (audio.error()) {
          <div uiAlert variant="destructive" role="alert">
            <svg lucideCircleAlert />
            <p uiAlertDescription>{{ audio.error() }}</p>
          </div>
        }

        <div class="-mx-2 max-h-[min(24rem,50dvh)] min-h-48 overflow-y-auto px-2 scrollbar-thin">
          @if (sounds.loading() && !sounds.results().length) {
            <div class="grid gap-2" aria-busy="true" aria-label="Buscando sonidos">
              @for (i of skeletons; track i) {
                <div class="flex items-center gap-3 rounded-lg border p-2">
                  <div uiSkeleton class="size-8"></div>
                  <div uiSkeleton class="h-4 flex-1"></div>
                  <div uiSkeleton class="h-8 w-24"></div>
                </div>
              }
            </div>
          } @else if (!sounds.searched()) {
            <app-empty-state
              [icon]="searchIcon"
              title="Busca un sonido"
              description="Escribe una palabra: los resultados aparecen mientras escribes."
              [bordered]="false"
            />
          } @else if (!sounds.results().length && !sounds.error()) {
            <app-empty-state
              [icon]="noResultsIcon"
              title="Sin resultados"
              description="Prueba con otra palabra o en inglés."
              [bordered]="false"
            />
          } @else {
            <ul class="grid gap-1.5" aria-label="Resultados">
              @for (s of sounds.results(); track s.id) {
                @let selected = s.id === selectedId();
                <li
                  class="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-surface-hover"
                  [class.border-primary]="selected"
                >
                  <app-sound-preview [url]="s.audioUrl" [title]="s.title" />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium" [title]="s.title">{{
                    s.title
                  }}</span>
                  <button
                    uiButton
                    size="sm"
                    type="button"
                    [variant]="selected ? 'secondary' : 'default'"
                    [attr.aria-label]="'Seleccionar ' + s.title"
                    (click)="pick(s)"
                  >
                    @if (selected) {
                      <svg lucideCheck /> Elegido
                    } @else {
                      Seleccionar
                    }
                  </button>
                </li>
              }
            </ul>
            @if (sounds.hasNext()) {
              <div class="flex justify-center pt-3">
                <button
                  uiButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  (click)="sounds.loadMore()"
                  [disabled]="sounds.loading()"
                >
                  @if (sounds.loading()) {
                    <ui-spinner /> Cargando…
                  } @else {
                    Cargar más
                  }
                </button>
              </div>
            }
          }
        </div>
      </ui-dialog-content>
    </ng-template>
  `,
})
export class SoundSelector {
  protected readonly sounds = inject(SoundsStore);
  protected readonly audio = inject(AudioService);
  private readonly dialogs = inject(UiDialogService);
  private readonly dialogTpl = viewChild.required<TemplateRef<unknown>>('dialog');
  private ref: DialogRef | undefined;

  readonly selectedId = input<string | undefined>(undefined);
  readonly buttonLabel = input('Elegir sonido');
  readonly variant = input<ButtonVariants['variant']>('outline');
  readonly size = input<ButtonVariants['size']>('default');
  readonly picked = output<Sound>();

  protected readonly searchIcon = LucideSearch;
  protected readonly noResultsIcon = LucideSearchX;
  protected readonly skeletons = [0, 1, 2, 3];

  protected open(): void {
    this.ref = this.dialogs.open(this.dialogTpl(), { size: 'lg' });
    this.ref.closed.subscribe(() => this.audio.stopSound());
  }

  protected pick(sound: Sound): void {
    this.picked.emit(sound);
    this.ref?.close();
  }
}
