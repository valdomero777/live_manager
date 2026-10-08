import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ASSET_MAX_BYTES, type Asset } from '@tiklive/contracts';
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
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Sonidos e imágenes</h1>

    <section
      class="card drop"
      [class.over]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
      aria-labelledby="up-title"
    >
      <h2 id="up-title">Subir archivos</h2>
      <p class="muted">
        Arrastra archivos aquí o elígelos. Sonidos: WAV, MP3, OGG, M4A (máx. {{ maxAudio }}).
        Imágenes: PNG, JPG, GIF, WebP; videos WebM (máx. {{ maxImage }}). El tipo se comprueba por
        el contenido del archivo.
      </p>
      <label class="button primary" for="file">Elegir archivos</label>
      <input
        id="file"
        class="sr-only"
        type="file"
        multiple
        [accept]="accept"
        (change)="onPick($event)"
      />
      @for (m of messages(); track $index) {
        <p class="notice" [class.ok]="m.ok" [class.danger]="!m.ok" role="status">{{ m.text }}</p>
      }
    </section>

    <div class="grid">
      @for (a of store.assets(); track a.id) {
        <article class="card stack asset">
          <div class="preview">
            @switch (a.kind) {
              @case ('audio') {
                <audio controls preload="none" [src]="a.url"></audio>
              }
              @case ('image') {
                <img [src]="a.url" alt="" loading="lazy" />
              }
              @case ('video') {
                <video [src]="a.url" muted loop playsinline controls preload="metadata"></video>
              }
            }
          </div>
          <div>
            <strong class="name" [title]="a.originalName">{{ a.originalName }}</strong>
            <div class="muted small">
              {{ kindLabels[a.kind] }} · {{ size(a.sizeBytes) }} · ID {{ a.id }} ·
              {{ a.createdAt | date: 'dd/MM/yy' }}
            </div>
          </div>
          <button type="button" class="danger" (click)="remove(a)" [disabled]="busy()">
            Eliminar
          </button>
        </article>
      } @empty {
        <p class="muted">Aún no hay archivos. Sube un sonido para usarlo en tus reglas.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1.25rem;
    }
    .drop {
      border-style: dashed;
      border-width: 2px;
    }
    .drop.over {
      border-color: var(--accent);
      background: var(--surface-2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      gap: 1rem;
    }
    .preview {
      display: grid;
      place-items: center;
      min-height: 7rem;
      background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% /
        16px 16px;
      border-radius: 8px;
      overflow: hidden;
    }
    .preview img,
    .preview video {
      max-width: 100%;
      max-height: 9rem;
    }
    .preview audio {
      width: 100%;
    }
    .name {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .small {
      font-size: 0.85rem;
    }
    .asset button {
      justify-self: start;
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
  protected readonly busy = signal(false);
  protected readonly dragging = signal(false);
  protected readonly messages = signal<{ ok: boolean; text: string }[]>([]);

  constructor() {
    void this.store.load();
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
    if (!confirm(`¿Eliminar «${asset.originalName}»?`)) return;
    this.busy.set(true);
    try {
      await this.store.delete(asset.id);
      this.messages.set([{ ok: true, text: `Eliminado: ${asset.originalName}` }]);
    } catch (e) {
      this.messages.set([{ ok: false, text: `No se pudo eliminar: ${errorMessage(e)}` }]);
    } finally {
      this.busy.set(false);
    }
  }

  private async uploadAll(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.busy.set(true);
    const results: { ok: boolean; text: string }[] = [];
    for (const file of files) {
      try {
        const asset = await this.store.upload(file);
        results.push({ ok: true, text: `Subido: ${file.name} (ID ${asset.id})` });
      } catch (e) {
        results.push({ ok: false, text: `${file.name}: ${errorMessage(e)}` });
      }
    }
    this.messages.set(results);
    this.busy.set(false);
  }
}
