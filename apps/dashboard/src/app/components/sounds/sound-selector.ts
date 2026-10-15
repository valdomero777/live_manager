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
import {
  SOUND_SOURCES,
  SOUND_SOURCE_LABELS,
  type Sound,
  type SoundLicense,
} from '@tiklive/contracts';
import { AudioService } from '../../core/audio.service';
import { SoundsStore } from '../../core/sounds.store';
import { EmptyState } from '../shared/empty-state';
import { UI_ALERT } from '../ui/alert';
import { UiButton, type ButtonVariants } from '../ui/button';
import { UI_DIALOG, UiDialogService } from '../ui/dialog';
import { UiSkeleton, UiSpinner } from '../ui/feedback';
import { UiInput } from '../ui/input';
import { UI_TOGGLE_GROUP } from '../ui/toggle-group';
import { SoundPreview } from './sound-preview';
import { selectLabel } from '../../lib/accessible-labels';

/** Licence notes shown next to Freesound results. */
const LICENSE_LABELS: Readonly<Record<SoundLicense, string>> = {
  cc0: $localize`CC0 · uso libre`,
  'cc-by': $localize`CC BY · menciona al autor`,
};

/**
 * Search MyInstants or Freesound (through our API: SoundsStore), preview and pick a sound, in a
 * dialog. The search logic lives in the store; this is only its presentation.
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
    ...UI_TOGGLE_GROUP,
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
          <h2 i18n uiDialogTitle>Elegir sonido</h2>
          <p i18n uiDialogDescription>
            Busca en MyInstants o en Freesound. El sonido se reproduce desde su sitio: no se
            descarga.
          </p>
        </header>

        <div i18n-aria-label uiToggleGroup aria-label="Dónde buscar">
          @for (source of sources; track source) {
            <button
              uiToggleGroupItem
              [pressed]="sounds.source() === source"
              (click)="sounds.setSource(source)"
            >
              {{ sourceLabels[source] }}
            </button>
          }
        </div>

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
            <label i18n class="sr-only" for="sound-q">Buscar sonidos</label>
            <input
              i18n-placeholder
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
          <button i18n uiButton type="submit" [disabled]="sounds.loading()">Buscar</button>
        </form>

        @if (audio.blocked()) {
          <div uiAlert variant="warning" role="alert">
            <svg lucideVolumeX />
            <p i18n uiAlertTitle>El navegador bloqueó el audio</p>
            <div uiAlertDescription>
              <p i18n>Actívalo para poder escuchar las vistas previas.</p>
              <button
                i18n
                uiButton
                size="sm"
                variant="outline"
                type="button"
                (click)="audio.unlock()"
              >
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
            <div i18n-aria-label class="grid gap-2" aria-busy="true" aria-label="Buscando sonidos">
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
              i18n-description
              i18n-title
              [icon]="searchIcon"
              title="Busca un sonido"
              description="Escribe una palabra: los resultados aparecen mientras escribes."
              [bordered]="false"
            />
          } @else if (!sounds.results().length && !sounds.error()) {
            <app-empty-state
              i18n-description
              i18n-title
              [icon]="noResultsIcon"
              title="Sin resultados"
              description="Prueba con otra palabra o en inglés."
              [bordered]="false"
            />
          } @else {
            <ul i18n-aria-label class="grid gap-1.5" aria-label="Resultados">
              @for (s of sounds.results(); track s.id) {
                @let selected = s.id === selectedId();
                <li
                  class="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-surface-hover"
                  [class.border-primary]="selected"
                >
                  <app-sound-preview [url]="s.audioUrl" [title]="s.title" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium" [title]="s.title">{{ s.title }}</p>
                    @if (s.author) {
                      <p i18n class="truncate text-xs text-muted-foreground">
                        por
                        <a
                          class="underline-offset-2 hover:underline"
                          [href]="s.pageUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          >{{ s.author }}</a
                        >
                        @if (s.license) {
                          · {{ licenseLabels[s.license] }}
                        }
                      </p>
                    }
                  </div>
                  <button
                    uiButton
                    size="sm"
                    type="button"
                    [variant]="selected ? 'secondary' : 'default'"
                    [attr.aria-label]="selectLabel(s.title)"
                    (click)="pick(s)"
                  >
                    @if (selected) {
                      <svg lucideCheck /> <ng-container i18n>Elegido</ng-container>
                    } @else {
                      <ng-container i18n>Seleccionar</ng-container>
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
                    <ui-spinner /> <ng-container i18n>Cargando…</ng-container>
                  } @else {
                    <ng-container i18n>Cargar más</ng-container>
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
  protected readonly selectLabel = selectLabel;
  protected readonly sounds = inject(SoundsStore);
  protected readonly audio = inject(AudioService);
  private readonly dialogs = inject(UiDialogService);
  private readonly dialogTpl = viewChild.required<TemplateRef<unknown>>('dialog');
  private ref: DialogRef | undefined;

  readonly selectedId = input<string | undefined>(undefined);
  readonly buttonLabel = input($localize`Elegir sonido`);
  readonly variant = input<ButtonVariants['variant']>('outline');
  readonly size = input<ButtonVariants['size']>('default');
  readonly picked = output<Sound>();

  protected readonly searchIcon = LucideSearch;
  protected readonly noResultsIcon = LucideSearchX;
  protected readonly skeletons = [0, 1, 2, 3];
  protected readonly sources = SOUND_SOURCES;
  protected readonly sourceLabels = SOUND_SOURCE_LABELS;
  protected readonly licenseLabels = LICENSE_LABELS;

  protected open(): void {
    this.ref = this.dialogs.open(this.dialogTpl(), { size: 'lg' });
    this.ref.closed.subscribe(() => this.audio.stopSound());
  }

  protected pick(sound: Sound): void {
    this.picked.emit(sound);
    this.ref?.close();
  }
}
