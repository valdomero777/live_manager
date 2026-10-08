import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ConnectorState,
  HealthResponse,
  LiveEvent,
  SettingsResponse,
} from '@tiklive/contracts';
import { AdminSocketService } from '../../core/admin-socket.service';
import { ApiClient, ApiError } from '../../core/api-client';
import { OverlayUrls } from './overlay-urls';

const HEALTH_POLL_MS = 5_000;

const STATE_LABELS: Readonly<Record<ConnectorState, string>> = {
  idle: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  waiting_host: 'Esperando a que inicies el live',
  reconnecting: 'Reconectando…',
  stopped: 'Detenido',
};

function describeEvent(e: LiveEvent): string {
  const who = 'viewer' in e ? `@${e.viewer.uniqueId}` : '';
  switch (e.type) {
    case 'comment':
      return `${who}: ${e.text}`;
    case 'gift':
      return `${who} envió ${e.quantity} × ${e.giftName} (${e.diamondValue * e.quantity} 💎)`;
    case 'like':
      return `${who} dio ${e.likeDelta} likes`;
    case 'follow':
      return `${who} te sigue`;
    case 'join':
      return `${who} entró`;
    case 'share':
      return `${who} compartió el live`;
    case 'viewerCount':
      return `${e.viewerCount} espectadores`;
    case 'streamEnd':
      return 'El live terminó';
  }
}

/** Operations overview: connector, system health, overlay URLs and the live event feed. */
@Component({
  selector: 'app-status-page',
  imports: [FormsModule, DatePipe, OverlayUrls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status.page.html',
  styleUrl: './status.page.css',
})
export class StatusPage {
  private readonly api = inject(ApiClient);
  protected readonly socket = inject(AdminSocketService);

  protected readonly health = signal<HealthResponse | undefined>(undefined);
  protected readonly overlayKey = signal<string | undefined>(undefined);
  protected readonly addresses = signal<readonly string[]>([]);
  protected readonly username = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  /** Socket updates win over the last polled health snapshot. */
  protected readonly connector = computed(
    () => this.socket.connectorStatus() ?? this.health()?.connector,
  );
  protected readonly stateLabel = computed(() => {
    const state = this.connector()?.state;
    return state ? STATE_LABELS[state] : '—';
  });
  protected readonly screens = computed(() => Object.entries(this.health()?.screens ?? {}));
  protected readonly recentEvents = computed(() =>
    this.socket
      .events()
      .slice(0, 25)
      .map((e) => ({ id: e.id, at: e.occurredAt, type: e.type, text: describeEvent(e) })),
  );

  constructor() {
    void this.loadHealth();
    void this.loadOverlayInfo();
    const timer = setInterval(() => void this.loadHealth(), HEALTH_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async connect(): Promise<void> {
    const username = this.username().trim() || this.connector()?.target;
    if (!username) {
      this.error.set('Escribe tu usuario de TikTok');
      return;
    }
    await this.run(() => this.api.post('/connector/connect', { username }));
  }

  protected async disconnect(): Promise<void> {
    await this.run(() => this.api.post('/connector/disconnect'));
  }

  protected uptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
      await this.loadHealth();
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadHealth(): Promise<void> {
    try {
      this.health.set(await this.api.get<HealthResponse>('/health'));
    } catch {
      this.health.set(undefined);
    }
  }

  private async loadOverlayInfo(): Promise<void> {
    const [settings, network] = await Promise.all([
      this.api.get<SettingsResponse>('/settings'),
      this.api.get<{ addresses: string[] }>('/settings/addresses'),
    ]);
    this.overlayKey.set(String(settings.fields['overlayKey']?.value ?? ''));
    this.addresses.set(network.addresses);
  }
}
