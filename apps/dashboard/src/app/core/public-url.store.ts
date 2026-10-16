import { Injectable, computed, signal } from '@angular/core';
import { normalizePublicUrl } from './public-url';

const STORAGE_KEY = 'tiklive.publicUrl';

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * The public address of the server (for example a Cloudflare tunnel). When set, the overlay
 * links the panel offers to copy use it instead of the local or LAN address. It is only a
 * convenience of this browser, so it lives in localStorage and never reaches the server.
 */
@Injectable({ providedIn: 'root' })
export class PublicUrlStore {
  readonly text = signal(read());
  /** The origin to use in links, or undefined while empty or invalid. */
  readonly origin = computed(() => normalizePublicUrl(this.text()));
  readonly invalid = computed(() => this.text().trim() !== '' && this.origin() === undefined);

  set(text: string): void {
    this.text.set(text);
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // Private mode or blocked storage: the value just lasts until the page is closed.
    }
  }
}
