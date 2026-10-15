import { Injectable, inject, signal } from '@angular/core';
import type { SettingsResponse } from '@tiklive/contracts';
import { ApiClient } from './api-client';

/**
 * The overlay key that the panel's embedded audio and live overlays authenticate with. Read from
 * settings, so a key rotated in «Ajustes» is picked up on the next load().
 */
@Injectable({ providedIn: 'root' })
export class OverlayKeyStore {
  private readonly api = inject(ApiClient);
  readonly key = signal('');
  private pending: Promise<string> | undefined;

  /** Coalesces concurrent calls into one request; resolves '' when settings cannot be read. */
  load(): Promise<string> {
    this.pending ??= this.api
      .get<SettingsResponse>('/settings')
      .then((settings) => {
        const key = String(settings.fields['overlayKey']?.value ?? '');
        this.key.set(key);
        return key;
      })
      .catch(() => this.key())
      .finally(() => (this.pending = undefined));
    return this.pending;
  }
}
