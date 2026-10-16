import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  inject,
  signal,
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
  LucideUpload,
  LucideVolumeX,
} from '@lucide/angular';
import {
  ASSET_MAX_BYTES,
  type Asset,
  SOUND_ORIGINS,
  SOUND_ORIGIN_LABELS,
  type Sound,
  type SoundLicense,
  type SoundOrigin,
} from '@tiklive/contracts';
import { AssetsStore } from '../../core/assets.store';
import { AudioService } from '../../core/audio.service';
import { SoundsStore } from '../../core/sounds.store';
import { errorMessage, formatBytes } from '../../lib/labels';
import { pickedFromAsset, pickedFromSound, type PickedSound } from './picked-sound';
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
    LucideUpload,
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
            Elige uno de tus audios, un sonido popular o busca en MyInstants o en Freesound. Los de
            MyInstants y Freesound se reproducen desde su sitio: no se descargan.
          </p>
        </header>

        <div i18n-aria-label uiToggleGroup aria-label="De dónde tomar el sonido">
          @for (origin of origins; track origin) {
            <button uiToggleGroupItem [pressed]="current() === origin" (click)="setOrigin(origin)">
              {{ originLabels[origin] }}
            </button>
          }
        </div>

        @if (current() === 'library') {
          <div class="flex flex-wrap items-center gap-3">
            <label
              uiButton
              variant="outline"
              size="sm"
              for="sound-upload"
              [attr.aria-disabled]="uploading()"
            >
              @if (uploading()) {
                <ui-spinner />
                <ng-container i18n>Importando…</ng-container>
              } @else {
                <svg lucideUpload />
                <ng-container i18n>Importar audio</ng-container>
              }
            </label>
            <input
              id="sound-upload"
              class="sr-only"
              type="file"
              accept=".wav,.mp3,.ogg,.m4a"
              (change)="upload($event)"
            />
            <p i18n class="type-caption">WAV, MP3, OGG o M4A, máx. {{ maxAudio }}.</p>
          </div>
          @if (uploadError()) {
            <div uiAlert variant="destructive" role="alert">
              <svg lucideCircleAlert />
              <p uiAlertDescription>{{ uploadError() }}</p>
            </div>
          }
          @if (audio.error()) {
            <div uiAlert variant="destructive" role="alert">
              <svg lucideCircleAlert />
              <p uiAlertDescription>{{ audio.error() }}</p>
            </div>
          }
          <div class="-mx-2 max-h-[min(24rem,50dvh)] min-h-48 overflow-y-auto px-2 scrollbar-thin">
            <ul i18n-aria-label class="grid gap-1.5" aria-label="Mis audios">
              @for (a of assets.sounds(); track a.id) {
                @let selected = a.id + '' === selectedId();
                <li
                  class="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-surface-hover"
                  [class.border-primary]="selected"
                >
                  <app-sound-preview [url]="a.url" [title]="a.originalName" />
                  <p class="min-w-0 flex-1 truncate text-sm font-medium" [title]="a.originalName">
                    {{ a.originalName }}
                  </p>
                  <button
                    uiButton
                    size="sm"
                    type="button"
                    [variant]="selected ? 'secondary' : 'default'"
                    [attr.aria-label]="selectLabel(a.originalName)"
                    (click)="pickAsset(a)"
                  >
                    @if (selected) {
                      <svg lucideCheck /> <ng-container i18n>Elegido</ng-container>
                    } @else {
                      <ng-container i18n>Seleccionar</ng-container>
                    }
                  </button>
                </li>
              } @empty {
                <app-empty-state
                  i18n-description
                  i18n-title
                  [icon]="searchIcon"
                  title="Aún no tienes audios"
                  description="Importa un archivo de sonido y quedará disponible para triggers y reglas."
                  [bordered]="false"
                />
              }
            </ul>
          </div>
        } @else {
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
              <div
                i18n-aria-label
                class="grid gap-2"
                aria-busy="true"
                aria-label="Buscando sonidos"
              >
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
                title="No hay sonidos para mostrar"
                description="Escribe una palabra para buscar: los resultados aparecen mientras escribes."
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
              @if (sounds.popular()) {
                <p i18n class="pb-2 text-xs font-medium text-muted-foreground">Populares</p>
              }
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
        }
      </ui-dialog-content>
    </ng-template>
  `,
})
export class SoundSelector {
  protected readonly selectLabel = selectLabel;
  protected readonly sounds = inject(SoundsStore);
  protected readonly assets = inject(AssetsStore);
  protected readonly audio = inject(AudioService);
  private readonly dialogs = inject(UiDialogService);
  private readonly dialogTpl = viewChild.required<TemplateRef<unknown>>('dialog');
  private ref: DialogRef | undefined;

  readonly selectedId = input<string | undefined>(undefined);
  readonly buttonLabel = input($localize`Elegir sonido`);
  readonly variant = input<ButtonVariants['variant']>('outline');
  readonly size = input<ButtonVariants['size']>('default');
  /** Where the dialog opens; the sound's current origin, so «Cambiar» starts where it was. */
  readonly initialOrigin = input<SoundOrigin>('myinstants');
  readonly picked = output<PickedSound>();

  protected readonly searchIcon = LucideSearch;
  protected readonly noResultsIcon = LucideSearchX;
  protected readonly skeletons = [0, 1, 2, 3];
  protected readonly origins = SOUND_ORIGINS;
  protected readonly originLabels = SOUND_ORIGIN_LABELS;
  protected readonly licenseLabels = LICENSE_LABELS;
  protected readonly maxAudio = formatBytes(ASSET_MAX_BYTES.audio);
  protected readonly current = signal<SoundOrigin>('myinstants');
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | undefined>(undefined);

  protected open(): void {
    this.uploadError.set(undefined);
    this.ref = this.dialogs.open(this.dialogTpl(), { size: 'lg' });
    this.ref.closed.subscribe(() => this.audio.stopSound());
    void this.setOrigin(this.initialOrigin(), true);
  }

  protected async setOrigin(origin: SoundOrigin, opening = false): Promise<void> {
    if (!opening && origin === this.current()) return;
    this.current.set(origin);
    this.audio.stopSound();
    if (origin === 'library') {
      await this.assets.load().catch((e: unknown) => this.uploadError.set(errorMessage(e)));
      return;
    }
    if (opening) {
      // A fresh dialog shows the catalogue's popular sounds, not the last search.
      this.sounds.source.set(origin);
      await this.sounds.search('');
    } else {
      await this.sounds.setSource(origin);
    }
  }

  protected pick(sound: Sound): void {
    this.emit(pickedFromSound(sound));
  }

  protected pickAsset(asset: Asset): void {
    this.emit(pickedFromAsset(asset));
  }

  /** Imports straight into the library and picks the new file, so it is one step, not two. */
  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set(undefined);
    try {
      const asset = await this.assets.upload(file);
      if (asset.kind === 'audio') this.pickAsset(asset);
      else this.uploadError.set($localize`«${asset.originalName}» no es un audio.`);
    } catch (e) {
      this.uploadError.set(errorMessage(e));
    } finally {
      this.uploading.set(false);
    }
  }

  private emit(sound: PickedSound): void {
    this.picked.emit(sound);
    this.ref?.close();
  }
}
