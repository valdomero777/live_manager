import { Injectable, computed, inject, signal } from '@angular/core';
import type { Asset } from '@tiklive/contracts';
import { ApiClient } from './api-client';

/** Asset library shared by the assets page and the rule/goal editors' pickers. */
@Injectable({ providedIn: 'root' })
export class AssetsStore {
  private readonly api = inject(ApiClient);
  readonly assets = signal<readonly Asset[]>([]);
  readonly sounds = computed(() => this.assets().filter((a) => a.kind === 'audio'));
  readonly visuals = computed(() => this.assets().filter((a) => a.kind !== 'audio'));

  async load(): Promise<void> {
    this.assets.set(await this.api.get<Asset[]>('/assets'));
  }

  async upload(file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file, file.name);
    const asset = await this.api.post<Asset>('/assets', form);
    await this.load();
    return asset;
  }

  async delete(id: number): Promise<void> {
    await this.api.delete(`/assets/${id}`);
    await this.load();
  }

  nameOf(id: number | undefined): string {
    if (id === undefined) return '—';
    return this.assets().find((a) => a.id === id)?.originalName ?? `#${id} (no existe)`;
  }
}
