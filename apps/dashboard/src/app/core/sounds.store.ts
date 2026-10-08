import { Injectable, inject, signal } from '@angular/core';
import type { Sound, SoundSearchResult } from '@tiklive/contracts';
import { ApiClient } from './api-client';

export const SEARCH_DEBOUNCE_MS = 400;
export const SEARCH_ERROR = 'No se pudieron cargar los sonidos. Intenta nuevamente.';

/** Sound search state. The browser only ever talks to our API, never to MyInstants. */
@Injectable({ providedIn: 'root' })
export class SoundsStore {
  private readonly api = inject(ApiClient);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  private query = '';
  private page = 1;

  readonly results = signal<readonly Sound[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly hasNext = signal(false);
  /** False until the first search, so the UI can tell "nothing yet" from "no matches". */
  readonly searched = signal(false);

  /** Typing: waits for a pause so «vine boom» is one request, not nine. */
  searchDebounced(query: string): void {
    clearTimeout(this.timer);
    if (query.trim().length === 0) {
      this.reset();
      return;
    }
    this.timer = setTimeout(() => void this.search(query), SEARCH_DEBOUNCE_MS);
  }

  /** The Search button / Enter: no wait. */
  async search(query: string): Promise<void> {
    clearTimeout(this.timer);
    const q = query.trim();
    if (!q) return this.reset();
    this.query = q;
    this.results.set([]);
    await this.fetchPage(1);
  }

  async loadMore(): Promise<void> {
    if (this.loading() || !this.hasNext()) return;
    await this.fetchPage(this.page + 1);
  }

  private reset(): void {
    this.request++;
    this.query = '';
    this.results.set([]);
    this.hasNext.set(false);
    this.error.set(undefined);
    this.loading.set(false);
    this.searched.set(false);
  }

  private async fetchPage(page: number): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(undefined);
    try {
      const params = new URLSearchParams({ q: this.query, page: String(page) });
      const result = await this.api.get<SoundSearchResult>(`/sounds/search?${params}`);
      if (id !== this.request) return; // a newer search replaced this one
      this.page = page;
      this.results.update((current) =>
        page === 1 ? result.results : [...current, ...result.results],
      );
      this.hasNext.set(result.hasNext);
      this.searched.set(true);
    } catch {
      if (id === this.request) this.error.set(SEARCH_ERROR);
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
}
