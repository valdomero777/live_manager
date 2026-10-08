import { Injectable, inject, signal } from '@angular/core';
import type { GiftCatalog } from '@tiklive/contracts';
import { errorMessage } from '../shared/labels';
import { ApiClient } from './api-client';

/** TikTok gift catalog (name, coins, image) for the rule editor's gift picker. */
@Injectable({ providedIn: 'root' })
export class GiftsStore {
  private readonly api = inject(ApiClient);
  readonly catalog = signal<GiftCatalog | undefined>(undefined);
  readonly loading = signal(false);
  readonly error = signal<string | undefined>(undefined);

  /** Loads once per app session; `refresh` asks the server to download it again from TikTok. */
  async load(refresh = false): Promise<void> {
    if ((this.catalog() && !refresh) || this.loading()) return;
    this.loading.set(true);
    this.error.set(undefined);
    try {
      this.catalog.set(await this.api.get<GiftCatalog>(`/gifts${refresh ? '?refresh=true' : ''}`));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
