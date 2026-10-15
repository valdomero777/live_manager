import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  OVERLAY_TEMPLATE_TYPES,
  type Goal,
  type OverlayTemplate,
  type OverlayTemplateType,
  type SettingsResponse,
} from '@tiklive/contracts';
import { ApiClient, ApiError } from '../../core/api-client';
import { OverlayTemplatesStore } from '../../core/overlay-templates.store';
import {
  LucideBookmark,
  LucideExternalLink,
  LucideFolderOpen,
  LucideRefreshCw,
  LucideSave,
  LucideSlidersHorizontal,
  LucideTrash2,
  LucideTv,
} from '@lucide/angular';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { ToastService } from '../../components/ui/toast';
import { CopyButton } from '../../components/shared/copy-button';
import { PageHeader } from '../../components/shared/page-header';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiFormField } from '../../components/ui/form-field';
import { UiCheckbox, UiInput, UiNativeSelect } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { UI_TOGGLE_GROUP } from '../../components/ui/toggle-group';
import {
  OVERLAY_TYPES,
  buildOverlayUrl,
  type OverlayParam,
  type OverlayType,
} from './overlay-catalog';
import { RotatorEditor } from './rotator-editor';

function isTemplateType(id: string): id is OverlayTemplateType {
  return (OVERLAY_TEMPLATE_TYPES as readonly string[]).includes(id);
}

/**
 * Overlay configurator (spec 12): pick an overlay, tune its parameters, see a live preview and
 * copy the final URL instead of editing query strings by hand. Configurations can be saved as
 * templates, reloaded later and pinned to the dashboard's live view.
 */
@Component({
  selector: 'app-overlays-page',
  imports: [
    CopyButton,
    RotatorEditor,
    PageHeader,
    UiButton,
    UiCheckbox,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiSwitch,
    ...UI_CARD,
    ...UI_TOGGLE_GROUP,
    LucideBookmark,
    LucideExternalLink,
    LucideFolderOpen,
    LucideRefreshCw,
    LucideSave,
    LucideSlidersHorizontal,
    LucideTrash2,
    LucideTv,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  templateUrl: './overlays.page.html',
})
export class OverlaysPage {
  private readonly api = inject(ApiClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(OverlayTemplatesStore);
  protected readonly types = OVERLAY_TYPES;

  /** Template being edited, if one was loaded or just saved. */
  protected readonly templateId = signal<string | undefined>(undefined);
  protected readonly templateName = signal('');
  protected readonly saving = signal(false);
  protected readonly canSaveTemplate = computed(
    () => isTemplateType(this.typeId()) && this.templateName().trim() !== '' && !this.saving(),
  );
  protected readonly loadedTemplate = computed(() =>
    this.store.templates().find((t) => t.id === this.templateId()),
  );

  protected readonly typeId = signal(OVERLAY_TYPES[0]?.id ?? 'leaderboard');
  protected readonly values = signal<Readonly<Record<string, string>>>({});
  protected readonly overlayKey = signal('');
  protected readonly hosts = signal<readonly string[]>([location.host]);
  protected readonly host = signal(location.host);
  protected readonly goals = signal<readonly Goal[]>([]);
  protected readonly previewBg = signal<'checker' | 'dark' | 'light'>('checker');
  protected readonly backgrounds = [
    { value: 'checker', label: 'Transparente' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'light', label: 'Claro' },
  ] as const;
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
    void this.store.load().catch(() => this.toast.error('No se pudieron cargar las plantillas'));
  }

  protected selectType(id: string): void {
    this.typeId.set(id);
    this.values.set({});
    this.templateId.set(undefined);
  }

  protected typeLabel(id: string): string {
    return OVERLAY_TYPES.find((t) => t.id === id)?.label ?? id;
  }

  protected templateUrl(template: OverlayTemplate): string {
    const type = OVERLAY_TYPES.find((t) => t.id === template.type);
    if (!type) return '';
    return buildOverlayUrl(
      type,
      template.params,
      this.overlayKey(),
      `${location.protocol}//${this.host()}`,
    );
  }

  protected loadTemplate(template: OverlayTemplate): void {
    this.typeId.set(template.type);
    this.values.set({ ...template.params });
    this.templateId.set(template.id);
    this.templateName.set(template.name);
  }

  /** Saves the current configuration; `asNew` keeps the loaded template untouched. */
  protected async saveTemplate(asNew: boolean): Promise<void> {
    const type = this.typeId();
    if (!isTemplateType(type) || !this.canSaveTemplate()) return;
    const current = asNew ? undefined : this.loadedTemplate();
    const input = {
      name: this.templateName().trim(),
      type,
      params: this.values(),
      pinned: current?.pinned ?? false,
    };
    this.saving.set(true);
    try {
      const saved = current
        ? await this.store.update(current.id, input)
        : await this.store.create(input);
      this.templateId.set(saved.id);
      this.toast.success(current ? 'Plantilla actualizada' : 'Plantilla guardada', saved.name);
    } catch (error) {
      this.toast.error('No se pudo guardar la plantilla', this.describe(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async setPinned(template: OverlayTemplate, pinned: boolean): Promise<void> {
    try {
      await this.store.setPinned(template, pinned);
    } catch (error) {
      this.toast.error('No se pudo cambiar la plantilla', this.describe(error));
    }
  }

  protected async deleteTemplate(template: OverlayTemplate): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `¿Eliminar «${template.name}»?`,
      description: 'Las fuentes de OBS o LIVE Studio que ya usan su URL seguirán funcionando.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.store.remove(template.id);
      if (this.templateId() === template.id) this.templateId.set(undefined);
    } catch (error) {
      this.toast.error('No se pudo eliminar la plantilla', this.describe(error));
    }
  }

  private describe(error: unknown): string {
    return error instanceof ApiError ? error.message : String(error);
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
