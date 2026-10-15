import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { Sound, SoundSearchResult } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError } from './api-client';
import { SoundsStore } from './sounds.store';

const sound = (id: string): Sound => ({ id, title: id }) as unknown as Sound;
const page = (...ids: string[]): SoundSearchResult => ({
  query: '',
  page: 1,
  hasNext: false,
  results: ids.map(sound),
});

interface Deferred {
  path: string;
  resolve: (value: SoundSearchResult) => void;
  reject: (error: unknown) => void;
}

/** ApiClient stand-in: every GET stays pending until the test settles it. */
function setup() {
  const calls: Deferred[] = [];
  const api = {
    get: (path: string) =>
      new Promise<SoundSearchResult>((resolve, reject) => calls.push({ path, resolve, reject })),
  };
  const injector = Injector.create({ providers: [{ provide: ApiClient, useValue: api }] });
  const store = runInInjectionContext(injector, () => new SoundsStore());
  return { store, calls };
}

describe('SoundsStore popular list', () => {
  it('does not support popular sounds for MyInstants and never calls the API', async () => {
    const { store, calls } = setup();
    expect(store.popularSupported()).toBe(false);
    await store.loadPopular();
    expect(calls).toEqual([]);
    expect(store.popular()).toEqual([]);
  });

  it('loads the popular list of Freesound once and reuses it', async () => {
    const { store, calls } = setup();
    const switched = store.setSource('freesound');
    expect(calls[0]?.path).toBe('/sounds/popular?source=freesound');
    expect(store.popularLoading()).toBe(true);
    calls[0]?.resolve(page('a', 'b'));
    await switched;
    expect(store.popular().map((s) => s.id)).toEqual(['a', 'b']);
    expect(store.popularLoading()).toBe(false);

    await store.loadPopular();
    expect(calls).toHaveLength(1);
  });

  it('reports a failure and retries on the next load', async () => {
    const { store, calls } = setup();
    store.source.set('freesound');
    const first = store.loadPopular();
    calls[0]?.reject(new ApiError(503, 'sin clave'));
    await first;
    expect(store.popularError()).toBe(true);
    expect(store.popularLoading()).toBe(false);

    const retry = store.loadPopular();
    expect(calls).toHaveLength(2);
    calls[1]?.resolve(page('a'));
    await retry;
    expect(store.popularError()).toBe(false);
    expect(store.popular()).toHaveLength(1);
  });

  it('ignores a popular answer that arrives after switching catalogue', async () => {
    const { store, calls } = setup();
    store.source.set('freesound');
    const stale = store.loadPopular();
    await store.setSource('myinstants');
    calls[0]?.resolve(page('late'));
    await stale;
    expect(store.popular()).toEqual([]);
  });

  it('shows the popular list again when the search box is cleared', async () => {
    const { store, calls } = setup();
    store.source.set('freesound');
    const search = store.search('boom');
    calls[0]?.resolve({ ...page('x'), query: 'boom' });
    await search;
    expect(store.searched()).toBe(true);

    const cleared = store.search('  ');
    expect(store.searched()).toBe(false);
    expect(calls[1]?.path).toBe('/sounds/popular?source=freesound');
    calls[1]?.resolve(page('a'));
    await cleared;
    expect(store.popular().map((s) => s.id)).toEqual(['a']);
  });
});
