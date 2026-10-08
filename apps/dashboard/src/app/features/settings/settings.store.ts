import { Injectable, computed, inject, signal } from '@angular/core';
import {
  API_PREFIX,
  SettingsValuesSchema,
  type HealthResponse,
  type SettingKey,
  type SettingsResponse,
  type SettingsUpdateResult,
} from '@tiklive/contracts';
import { ApiClient } from '../../core/api-client';

const RESTART_POLL_MS = 1_000;
const RESTART_TIMEOUT_MS = 45_000;

export type FieldValue = string | number | boolean;

/** Client-side validation with the same schema the server uses. */
export function validateField(key: SettingKey, value: FieldValue): string | undefined {
  const result = SettingsValuesSchema.shape[key].safeParse(value);
  return result.success ? undefined : (result.error.issues[0]?.message ?? 'Valor no válido');
}

/** Settings page state: what the server reports, saving patches and the restart flow. */
@Injectable()
export class SettingsStore {
  private readonly api = inject(ApiClient);

  readonly view = signal<SettingsResponse | undefined>(undefined);
  readonly lastResult = signal<SettingsUpdateResult | undefined>(undefined);
  readonly restarting = signal(false);
  readonly restartPending = computed(() => this.view()?.restartPending ?? false);

  async load(): Promise<void> {
    this.view.set(await this.api.get<SettingsResponse>('/settings'));
  }

  /** Sends only the changed fields; null clears the panel override (back to env/default). */
  async save(patch: Partial<Record<SettingKey, FieldValue | null>>): Promise<SettingsUpdateResult> {
    const result = await this.api.patch<SettingsUpdateResult>('/settings', patch);
    this.view.set(result);
    this.lastResult.set(result);
    return result;
  }

  async rotateOverlayKey(): Promise<SettingsUpdateResult> {
    const result = await this.api.post<SettingsUpdateResult>('/settings/overlay-key/rotate');
    this.view.set(result);
    this.lastResult.set(result);
    return result;
  }

  /**
   * Asks for an in-process restart and waits for the new instance. The old one answers for a
   * moment, so readiness means a lower uptime (or the new port listening when it changed).
   */
  async restart(): Promise<'restarted' | 'reverted'> {
    const target = this.targetAfterRestart();
    const moving = target.origin !== location.origin;
    this.restarting.set(true);
    const before = await this.api.get<HealthResponse>('/health');
    await this.api.post('/settings/restart');
    const outcome = await this.poll(async () => {
      if (moving && (await this.isListening(target.origin))) return 'moved';
      const health = await this.api.get<HealthResponse>('/health');
      return health.uptimeS < before.uptimeS ? 'same' : undefined;
    });
    if (outcome === 'moved') {
      location.assign(target.href);
      return 'restarted';
    }
    this.restarting.set(false);
    this.lastResult.set(undefined);
    await this.load();
    // Back on the old address although the port changed: the host restored the last good settings.
    return moving ? 'reverted' : 'restarted';
  }

  /** Same page on the port saved in the settings (the session cookie is not port-bound). */
  private targetAfterRestart(): URL {
    const target = new URL(location.href);
    const port = this.view()?.fields['port']?.value;
    if (typeof port === 'number' && port > 0 && String(port) !== (location.port || '80')) {
      target.port = String(port);
    }
    return target;
  }

  private async isListening(origin: string): Promise<boolean> {
    try {
      // no-cors: a response from another port is opaque, but proves the server is listening.
      await fetch(`${origin}${API_PREFIX}/health`, { mode: 'no-cors', cache: 'no-store' });
      return true;
    } catch {
      return false;
    }
  }

  private async poll<T>(check: () => Promise<T | undefined>): Promise<T> {
    const deadline = Date.now() + RESTART_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(RESTART_POLL_MS);
      try {
        const result = await check();
        if (result !== undefined) return result;
      } catch {
        // the server is still restarting
      }
    }
    this.restarting.set(false);
    throw new Error('El servidor tardó demasiado en volver. Revisa la consola del servidor.');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
