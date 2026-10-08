import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { Goal, SettingsResponse } from '@tiklive/contracts';
import { ApiClient } from '../../core/api-client';
import { CopyButton } from '../../components/shared/copy-button';
import {
  OVERLAY_TYPES,
  buildOverlayUrl,
  type OverlayParam,
  type OverlayType,
} from './overlay-catalog';
import { RotatorEditor } from './rotator-editor';

/**
 * Overlay configurator (spec 12): pick an overlay, tune its parameters, see a live preview and
 * copy the final URL instead of editing query strings by hand.
 */
@Component({
  selector: 'app-overlays-page',
  imports: [CopyButton, RotatorEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overlays.page.html',
  styleUrl: './overlays.page.css',
})
export class OverlaysPage {
  private readonly api = inject(ApiClient);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly types = OVERLAY_TYPES;

  protected readonly typeId = signal(OVERLAY_TYPES[0]?.id ?? 'leaderboard');
  protected readonly values = signal<Readonly<Record<string, string>>>({});
  protected readonly overlayKey = signal('');
  protected readonly hosts = signal<readonly string[]>([location.host]);
  protected readonly host = signal(location.host);
  protected readonly goals = signal<readonly Goal[]>([]);
  protected readonly previewBg = signal<'checker' | 'dark' | 'light'>('checker');
  protected readonly reloadToken = signal(0);

  protected readonly type = computed<OverlayType>(
    () => OVERLAY_TYPES.find((t) => t.id === this.typeId()) ?? (OVERLAY_TYPES[0] as OverlayType),
  );
  protected readonly url = computed(() =>
    buildOverlayUrl(
      this.type(),
      this.values(),
      this.overlayKey(),
      `${location.protocol}//${this.host()}`,
    ),
  );
  /** Same-origin preview so it works whatever LAN address is chosen for the copied URL. */
  protected readonly previewUrl = computed(() => {
    this.reloadToken();
    const url = buildOverlayUrl(this.type(), this.values(), this.overlayKey(), location.origin);
    return this.sanitizer.bypassSecurityTrustResourceUrl(`${url}&_=${this.reloadToken()}`);
  });

  constructor() {
    void this.load();
  }

  protected selectType(id: string): void {
    this.typeId.set(id);
    this.values.set({});
  }

  protected value(p: OverlayParam): string {
    return this.values()[p.key] ?? p.default;
  }

  protected set(p: OverlayParam, value: string): void {
    this.values.update((v) => ({ ...v, [p.key]: value }));
  }

  protected toggleMulti(p: OverlayParam, option: string, checked: boolean): void {
    const current = new Set(this.value(p).split(',').filter(Boolean));
    if (checked) current.add(option);
    else current.delete(option);
    const ordered = (p.options ?? []).map((o) => o.value).filter((v) => current.has(v));
    this.set(p, ordered.join(','));
  }

  protected isChecked(p: OverlayParam, option: string): boolean {
    return this.value(p).split(',').includes(option);
  }

  private async load(): Promise<void> {
    const [settings, network, goals] = await Promise.all([
      this.api.get<SettingsResponse>('/settings'),
      this.api.get<{ addresses: string[] }>('/settings/addresses'),
      this.api.get<Goal[]>('/goals'),
    ]);
    this.overlayKey.set(String(settings.fields['overlayKey']?.value ?? ''));
    const port = location.port ? `:${location.port}` : '';
    const hosts = [...new Set([...network.addresses.map((a) => `${a}${port}`), location.host])];
    this.hosts.set(hosts);
    this.host.set(hosts[0] ?? location.host);
    this.goals.set(goals);
  }
}
