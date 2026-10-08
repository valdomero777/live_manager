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
import {
  LucideCircleAlert,
  LucideDatabase,
  LucideLink,
  LucideMonitor,
  LucidePlug,
  LucideRadio,
  LucideServer,
  LucideUnplug,
} from '@lucide/angular';
import type { HealthResponse, SettingsResponse } from '@tiklive/contracts';
import { EventFeed } from '../../components/live/event-feed';
import { toFeedItem } from '../../components/live/event-format';
import { LiveStatus } from '../../components/live/live-status';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiBadge } from '../../components/ui/badge';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSkeleton, UiSpinner } from '../../components/ui/feedback';
import { UiInput } from '../../components/ui/input';
import { AdminSocketService } from '../../core/admin-socket.service';
import { ApiClient, ApiError } from '../../core/api-client';
import { OverlayUrls } from './overlay-urls';

const HEALTH_POLL_MS = 5_000;

/** Operations overview: connector, system health, overlay URLs and the live event feed. */
@Component({
  selector: 'app-status-page',
  imports: [
    FormsModule,
    DatePipe,
    OverlayUrls,
    PageHeader,
    LiveStatus,
    EventFeed,
    UiBadge,
    UiButton,
    UiInput,
    UiSkeleton,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    LucidePlug,
    LucideUnplug,
    LucideServer,
    LucideDatabase,
    LucideMonitor,
    LucideLink,
    LucideRadio,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  templateUrl: './status.page.html',
})
export class StatusPage {
  private readonly api = inject(ApiClient);
  protected readonly socket = inject(AdminSocketService);

  protected readonly health = signal<HealthResponse | undefined>(undefined);
  protected readonly healthLoading = signal(true);
  protected readonly overlayKey = signal<string | undefined>(undefined);
  protected readonly addresses = signal<readonly string[]>([]);
  protected readonly username = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  /** Socket updates win over the last polled health snapshot. */
  protected readonly connector = computed(
    () => this.socket.connectorStatus() ?? this.health()?.connector,
  );
  protected readonly isActive = computed(() => {
    const state = this.connector()?.state;
    return state !== undefined && state !== 'idle' && state !== 'stopped';
  });
  protected readonly screens = computed(() => Object.entries(this.health()?.screens ?? {}));
  protected readonly recentEvents = computed(() =>
    this.socket.events().slice(0, 50).map(toFeedItem),
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
    } finally {
      this.healthLoading.set(false);
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
