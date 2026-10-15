import { Injectable, computed, inject, signal } from '@angular/core';
import {
  POPULAR_SOUND_SOURCES,
  type Sound,
  type SoundSearchResult,
  type SoundSource,
} from '@tiklive/contracts';
import { ApiClient, ApiError } from './api-client';

export const SEARCH_DEBOUNCE_MS = 400;
export const SEARCH_ERROR = 'No se pudieron cargar los sonidos. Intenta nuevamente.';

/**
 * Sound search state. The browser only ever talks to our API, never to MyInstants or Freesound
 * (the Freesound key stays on the server).
 */
@Injectable({ providedIn: 'root' })
export class SoundsStore {
  private readonly api = inject(ApiClient);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  private popularRequest = 0;
  private query = '';
  private page = 1;

  /** Catalogue being searched; MyInstants first because it is what most people know. */
  readonly source = signal<SoundSource>('myinstants');
  readonly results = signal<readonly Sound[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly hasNext = signal(false);
  /** False until the first search, so the UI can tell "nothing yet" from "no matches". */
  readonly searched = signal(false);

  /** Most downloaded sounds of the current catalogue, shown until the user searches. */
  readonly popular = signal<readonly Sound[]>([]);
  readonly popularLoading = signal(false);
  readonly popularError = signal(false);
  /** Whether the current catalogue has such a list at all (MyInstants does not). */
  readonly popularSupported = computed(() => POPULAR_SOUND_SOURCES.includes(this.source()));

  /** Switching catalogue repeats the current search there, so the user does not retype it. */
  async setSource(source: SoundSource): Promise<void> {
    if (source === this.source()) return;
    this.source.set(source);
    const query = this.query;
    this.reset();
    this.popular.set([]);
    if (query) await this.search(query);
    else await this.loadPopular();
  }

  /** Loads the popular list for the current catalogue; skipped while it is already loaded. */
  async loadPopular(): Promise<void> {
    if (!this.popularSupported()) {
      this.popular.set([]);
      return;
    }
    if (this.popular().length && !this.popularError()) return;
    const id = ++this.popularRequest;
    const source = this.source();
    this.popularLoading.set(true);
    this.popularError.set(false);
    try {
      const params = new URLSearchParams({ source });
      const result = await this.api.get<SoundSearchResult>(`/sounds/popular?${params}`);
      if (id !== this.popularRequest || source !== this.source()) return;
      this.popular.set(result.results);
    } catch {
      if (id === this.popularRequest) this.popularError.set(true);
    } finally {
      if (id === this.popularRequest) this.popularLoading.set(false);
    }
  }

  /** Typing: waits for a pause so «vine boom» is one request, not nine. */
  searchDebounced(query: string): void {
    clearTimeout(this.timer);
    if (query.trim().length === 0) {
      this.reset();
      void this.loadPopular();
      return;
    }
    this.timer = setTimeout(() => void this.search(query), SEARCH_DEBOUNCE_MS);
  }

  /** The Search button / Enter: no wait. */
  async search(query: string): Promise<void> {
    clearTimeout(this.timer);
    const q = query.trim();
    if (!q) {
      this.reset();
      return this.loadPopular();
    }
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
      const params = new URLSearchParams({
        q: this.query,
        page: String(page),
        source: this.source(),
      });
      const result = await this.api.get<SoundSearchResult>(`/sounds/search?${params}`);
      if (id !== this.request) return; // a newer search replaced this one
      this.page = page;
      this.results.update((current) =>
        page === 1 ? result.results : [...current, ...result.results],
      );
      this.hasNext.set(result.hasNext);
      this.searched.set(true);
    } catch (error) {
      // The server's 502/503 titles are written for the user (e.g. «agrega tu clave en Ajustes»).
      const message = error instanceof ApiError && error.status >= 500 ? error.message : undefined;
      if (id === this.request) this.error.set(message ?? SEARCH_ERROR);
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
}
