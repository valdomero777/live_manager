import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LucideAudioLines, LucideCircleAlert, LucideTrash, LucideUpload } from '@lucide/angular';
import { ASSET_MAX_BYTES, type Asset } from '@tiklive/contracts';
import { EmptyState } from '../../components/shared/empty-state';
import { PageHeader } from '../../components/shared/page-header';
import { SoundPreview } from '../../components/sounds/sound-preview';
import { UI_ALERT } from '../../components/ui/alert';
import { UiBadge } from '../../components/ui/badge';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { UiSkeleton, UiSpinner } from '../../components/ui/feedback';
import { ToastService } from '../../components/ui/toast';
import { AssetsStore } from '../../core/assets.store';
import { errorMessage, formatBytes } from '../../lib/labels';

const ACCEPT = '.wav,.mp3,.ogg,.m4a,.png,.jpg,.jpeg,.gif,.webp,.webm';
const KIND_LABELS: Readonly<Record<Asset['kind'], string>> = {
  audio: 'Sonido',
  image: 'Imagen',
  video: 'Video',
};

/** Upload, preview and delete sounds and images (RF-19). */
@Component({
  selector: 'app-assets-page',
  imports: [
    DatePipe,
    PageHeader,
    EmptyState,
    SoundPreview,
    UiButton,
    UiBadge,
    UiSkeleton,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    LucideUpload,
    LucideTrash,
    LucideAudioLines,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  template: `
    <app-page-header
      title="Sonidos e imágenes"
      description="Archivos propios para tus reglas y metas: sonidos para «Reproducir sonido» e imágenes o GIF para las alertas."
    />

    <section
      class="relative grid justify-items-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors data-[dragging=true]:bg-primary/5"
      [class.border-primary]="dragging()"
      [attr.data-dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
      aria-labelledby="up-title"
    >
      <span
        class="grid size-12 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        @if (busy()) {
          <ui-spinner class="[&_svg]:size-5" />
        } @else {
          <svg lucideUpload class="size-5" />
        }
      </span>
      <div class="grid gap-1">
        <h2 id="up-title" class="type-card-title">Arrastra archivos aquí o elígelos</h2>
        <p class="max-w-xl type-secondary">
          Sonidos: WAV, MP3, OGG, M4A (máx. {{ maxAudio }}). Imágenes: PNG, JPG, GIF, WebP; videos
          WebM (máx. {{ maxImage }}). El tipo se comprueba por el contenido del archivo.
        </p>
      </div>
      <label uiButton for="file" [attr.aria-disabled]="busy()">
        <svg lucideUpload /> {{ busy() ? 'Subiendo…' : 'Elegir archivos' }}
      </label>
      <input
        id="file"
        class="sr-only"
        type="file"
        multiple
        [accept]="accept"
        (change)="onPick($event)"
      />
    </section>

    @if (failures().length) {
      <div uiAlert variant="destructive" role="alert">
        <svg lucideCircleAlert />
        <p uiAlertTitle>Algunos archivos no se pudieron procesar</p>
        <ul uiAlertDescription class="list-disc pl-4">
          @for (m of failures(); track $index) {
            <li>{{ m }}</li>
          }
        </ul>
      </div>
    }

    @if (loading()) {
      <div
        class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4"
        aria-busy="true"
        aria-label="Cargando archivos"
      >
        @for (i of [0, 1, 2]; track i) {
          <div uiSkeleton class="h-56 rounded-xl"></div>
        }
      </div>
    } @else {
      <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        @for (a of store.assets(); track a.id) {
          <article uiCard class="gap-4 pt-0" [attr.aria-label]="a.originalName">
            <div
              class="grid h-36 place-items-center overflow-hidden rounded-t-xl border-b bg-checker"
            >
              @switch (a.kind) {
                @case ('audio') {
                  <div class="grid justify-items-center gap-3">
                    <span
                      class="grid size-12 place-items-center rounded-full bg-sound-soft text-sound-text"
                      aria-hidden="true"
                    >
                      <svg lucideAudioLines class="size-6" />
                    </span>
                    <app-sound-preview
                      [url]="a.url"
                      [title]="a.originalName"
                      [showLabel]="true"
                      label="Escuchar"
                    />
                  </div>
                }
                @case ('image') {
                  <img
                    [src]="a.url"
                    alt=""
                    loading="lazy"
                    class="max-h-full max-w-full object-contain"
                  />
                }
                @case ('video') {
                  <video
                    [src]="a.url"
                    muted
                    loop
                    playsinline
                    controls
                    preload="metadata"
                    class="max-h-full max-w-full"
                  ></video>
                }
              }
            </div>
            <div uiCardContent class="grid gap-1.5">
              <p class="truncate text-sm font-medium" [title]="a.originalName">
                {{ a.originalName }}
              </p>
              <div class="flex flex-wrap items-center gap-1.5">
                <span uiBadge [variant]="a.kind === 'audio' ? 'sound' : 'analytics'">{{
                  kindLabels[a.kind]
                }}</span>
                <span class="type-caption"
                  >{{ size(a.sizeBytes) }} · ID {{ a.id }} ·
                  {{ a.createdAt | date: 'dd/MM/yy' }}</span
                >
              </div>
            </div>
            <footer uiCardFooter class="mt-auto">
              <button
                uiButton
                variant="ghost-destructive"
                size="sm"
                type="button"
                (click)="remove(a)"
                [disabled]="busy()"
              >
                <svg lucideTrash /> Eliminar
              </button>
            </footer>
          </article>
        } @empty {
          <app-empty-state
            class="col-span-full"
            title="Aún no hay archivos"
            description="Sube un sonido para usarlo en tus reglas."
          />
        }
      </div>
    }
  `,
})
export class AssetsPage {
  protected readonly store = inject(AssetsStore);
  protected readonly accept = ACCEPT;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly maxAudio = formatBytes(ASSET_MAX_BYTES.audio);
  protected readonly maxImage = formatBytes(ASSET_MAX_BYTES.image);
  protected readonly size = formatBytes;
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly dragging = signal(false);
  protected readonly failures = signal<string[]>([]);

  constructor() {
    void this.store
      .load()
      .catch((e: unknown) => this.failures.set([`No se pudo cargar la lista: ${errorMessage(e)}`]))
      .finally(() => this.loading.set(false));
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.uploadAll([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.uploadAll([...(event.dataTransfer?.files ?? [])]);
  }

  protected async remove(asset: Asset): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `¿Eliminar «${asset.originalName}»?`,
      description: 'Las reglas o metas que lo usan dejarán de reproducirlo o mostrarlo.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.failures.set([]);
    try {
      await this.store.delete(asset.id);
      this.toast.success('Archivo eliminado', asset.originalName);
    } catch (e) {
      this.failures.set([`No se pudo eliminar: ${errorMessage(e)}`]);
    } finally {
      this.busy.set(false);
    }
  }

  private async uploadAll(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.busy.set(true);
    const failures: string[] = [];
    let uploaded = 0;
    for (const file of files) {
      try {
        await this.store.upload(file);
        uploaded++;
      } catch (e) {
        failures.push(`${file.name}: ${errorMessage(e)}`);
      }
    }
    this.failures.set(failures);
    if (uploaded)
      this.toast.success(uploaded === 1 ? 'Archivo subido' : `${uploaded} archivos subidos`);
    this.busy.set(false);
  }
}
