import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type {
  SpotifyAuthorizeResponse,
  SpotifyNowPlaying,
  SpotifyStatus,
} from '@tiklive/contracts';
import {
  LucideCircleAlert,
  LucideCircleCheck,
  LucideExternalLink,
  LucideMusic,
  LucideRefreshCw,
  LucideUnplug,
} from '@lucide/angular';
import { CopyButton } from '../../components/shared/copy-button';
import { UI_ALERT } from '../../components/ui/alert';
import { UiBadge } from '../../components/ui/badge';
import { UiButton } from '../../components/ui/button';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { UiSpinner } from '../../components/ui/feedback';
import { UiInput } from '../../components/ui/input';
import { ApiClient, ApiError } from '../../core/api-client';

/** While the user approves access in the Spotify tab, check every few seconds. */
const POLL_MS = 3_000;
const POLL_FOR_MS = 10 * 60_000;

/** What `?spotify=` means after Spotify sends the browser back to Settings. */
const CALLBACK_MESSAGES: Readonly<Record<string, string>> = {
  invalid_state: $localize`El inicio de sesión con Spotify caducó o se abrió en otra pestaña. Vuelve a pulsar «Conectar con Spotify».`,
  denied: $localize`No se dio permiso en Spotify.`,
  not_configured: $localize`Falta el Client ID de Spotify.`,
  invalid_callback: $localize`Spotify volvió sin el código de acceso. Vuelve a intentarlo.`,
  failed: $localize`Spotify no respondió al conectar. Vuelve a intentarlo en un momento.`,
};

/**
 * Connects the streamer's Spotify account (ADR 0014). Spotify only redirects to 127.0.0.1, so a
 * browser on another device ends on an error page; pasting that address here finishes the login.
 */
@Component({
  selector: 'app-spotify-connection',
  imports: [
    FormsModule,
    CopyButton,
    UiBadge,
    UiButton,
    UiInput,
    UiSpinner,
    ...UI_ALERT,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideExternalLink,
    LucideMusic,
    LucideRefreshCw,
    LucideUnplug,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    @if (callbackMessage(); as message) {
      <div uiAlert [variant]="message.ok ? 'success' : 'destructive'" role="status">
        @if (message.ok) {
          <svg lucideCircleCheck />
        } @else {
          <svg lucideCircleAlert />
        }
        <p uiAlertTitle>{{ message.text }}</p>
      </div>
    }
    @if (error(); as e) {
      <div uiAlert variant="destructive" role="alert">
        <svg lucideCircleAlert />
        <p uiAlertTitle>{{ e }}</p>
      </div>
    }

    @if (status(); as s) {
      <div class="grid gap-2">
        <span i18n class="type-label">Redirect URI para registrar en Spotify</span>
        <div class="flex flex-wrap items-center gap-2">
          <code class="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all">{{
            s.redirectUri
          }}</code>
          <app-copy-button [value]="s.redirectUri" i18n-label label="Redirect URI" />
        </div>
        <p i18n class="type-caption">
          En developer.spotify.com crea una app (tipo Web API), pega aquí su Client ID y añade esta
          dirección en «Redirect URIs». La cuenta dueña de la app necesita Spotify Premium.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
        @if (s.connected) {
          <span i18n uiBadge variant="success">Conectado</span>
          @if (s.account) {
            <span class="type-secondary">{{ s.account }}</span>
          }
          <button
            i18n
            uiButton
            variant="outline"
            size="sm"
            type="button"
            (click)="refreshNowPlaying()"
            [disabled]="busy()"
          >
            <svg lucideRefreshCw /> Ver qué suena
          </button>
          <button
            i18n
            uiButton
            variant="ghost"
            size="sm"
            type="button"
            (click)="disconnect()"
            [disabled]="busy()"
          >
            <svg lucideUnplug /> Desconectar
          </button>
        } @else {
          @if (s.problem === 'revoked') {
            <span i18n uiBadge variant="warning">Hay que volver a conectar</span>
          } @else {
            <span i18n uiBadge variant="secondary">Sin conectar</span>
          }
          <button
            i18n
            uiButton
            size="sm"
            type="button"
            (click)="connect()"
            [disabled]="busy() || !s.configured"
          >
            <svg lucideExternalLink /> Conectar con Spotify
          </button>
          @if (!s.configured) {
            <span i18n class="type-caption">Primero guarda el Client ID.</span>
          }
        }
        @if (busy()) {
          <ui-spinner />
        }
      </div>

      @if (waiting() && !s.connected) {
        <div class="grid gap-2">
          <label i18n class="type-label" for="spotify-callback"
            >¿Aprobaste en otro dispositivo y viste una página de error?</label
          >
          <p i18n class="type-caption" id="spotify-callback-help">
            Copia la dirección completa de esa página (empieza por http://127.0.0.1) y pégala aquí.
          </p>
          <div class="flex flex-wrap gap-2">
            <input
              uiInput
              id="spotify-callback"
              class="max-w-md"
              type="url"
              autocomplete="off"
              spellcheck="false"
              aria-describedby="spotify-callback-help"
              [(ngModel)]="pasted"
              [ngModelOptions]="{ standalone: true }"
            />
            <button
              i18n
              uiButton
              variant="outline"
              size="sm"
              type="button"
              (click)="completeFromPaste()"
              [disabled]="busy() || !pasted.trim()"
            >
              Terminar conexión
            </button>
          </div>
        </div>
      }

      @if (nowPlaying(); as np) {
        <div class="flex items-center gap-3" aria-live="polite">
          @if (np.track?.imageUrl; as image) {
            <img [src]="image" alt="" class="size-12 rounded-md object-cover" />
          } @else {
            <svg lucideMusic class="size-6 text-muted-foreground" />
          }
          @if (np.track; as track) {
            <div class="min-w-0">
              <p class="truncate font-medium">{{ track.title }}</p>
              <p class="truncate type-caption">{{ track.artists.join(', ') }}</p>
            </div>
            @if (!np.isPlaying) {
              <span i18n uiBadge variant="outline">En pausa</span>
            }
          } @else {
            <p i18n class="type-secondary">No suena nada en Spotify ahora mismo.</p>
          }
        </div>
      }
    }
  `,
})
export class SpotifyConnection {
  /** Saved Client ID; when it changes, the status is read again. */
  readonly clientId = input<unknown>();

  private readonly api = inject(ApiClient);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);

  protected readonly status = signal<SpotifyStatus | undefined>(undefined);
  protected readonly nowPlaying = signal<SpotifyNowPlaying | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly waiting = signal(false);
  protected pasted = '';
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  private readonly callbackOutcome = signal(
    this.route.snapshot.queryParamMap.get('spotify') ?? undefined,
  );
  protected readonly callbackMessage = computed(() => {
    const outcome = this.callbackOutcome();
    if (!outcome) return undefined;
    if (outcome === 'connected') return { ok: true, text: $localize`Spotify quedó conectado.` };
    return { ok: false, text: CALLBACK_MESSAGES[outcome] ?? CALLBACK_MESSAGES['failed']! };
  });

  constructor() {
    effect(() => {
      this.clientId();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  protected async connect(): Promise<void> {
    // Opened before the request so the browser does not treat it as an unrequested pop-up.
    const tab = window.open('about:blank', '_blank');
    await this.run(async () => {
      const { authorizeUrl } = await this.api.post<SpotifyAuthorizeResponse>('/spotify/authorize');
      if (tab) {
        tab.opener = null;
        tab.location.href = authorizeUrl;
      } else {
        window.location.href = authorizeUrl;
      }
      this.callbackOutcome.set(undefined);
      this.waiting.set(true);
      this.startPolling();
    });
    if (this.error()) tab?.close();
  }

  protected async completeFromPaste(): Promise<void> {
    await this.run(async () => {
      const status = await this.api.post<SpotifyStatus>('/spotify/complete', {
        callbackUrl: this.pasted.trim(),
      });
      this.connected(status);
    });
  }

  protected async disconnect(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: $localize`¿Desconectar Spotify?`,
      description: $localize`El panel olvida el acceso. Para retirar el permiso por completo, quita la app en tu cuenta de Spotify (Apps).`,
      confirmLabel: $localize`Desconectar`,
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.delete('/spotify/connection');
      this.nowPlaying.set(undefined);
      this.callbackOutcome.set(undefined);
      await this.load();
    });
  }

  protected async refreshNowPlaying(): Promise<void> {
    await this.run(async () => {
      this.nowPlaying.set(await this.api.get<SpotifyNowPlaying>('/spotify/now-playing'));
    });
  }

  private async load(): Promise<void> {
    try {
      this.status.set(await this.api.get<SpotifyStatus>('/spotify/status'));
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : String(e));
    }
  }

  private connected(status: SpotifyStatus): void {
    this.status.set(status);
    if (!status.connected) return;
    this.waiting.set(false);
    this.pasted = '';
    this.stopPolling();
    this.callbackOutcome.set('connected');
  }

  private startPolling(): void {
    this.stopPolling();
    const until = Date.now() + POLL_FOR_MS;
    this.pollTimer = setInterval(() => {
      if (Date.now() > until) {
        this.stopPolling();
        return;
      }
      void this.api
        .get<SpotifyStatus>('/spotify/status')
        .then((s) => this.connected(s))
        .catch(() => undefined);
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
