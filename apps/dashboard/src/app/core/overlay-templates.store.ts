import { Injectable, inject, signal } from '@angular/core';
import type { OverlayTemplate, OverlayTemplateInput } from '@tiklive/contracts';
import { ApiClient } from './api-client';

/** Saved overlay configurations, shared by the Overlays page and the dashboard's live view. */
@Injectable({ providedIn: 'root' })
export class OverlayTemplatesStore {
  private readonly api = inject(ApiClient);
  readonly templates = signal<readonly OverlayTemplate[]>([]);
  readonly loaded = signal(false);

  async load(): Promise<void> {
    this.templates.set(await this.api.get<OverlayTemplate[]>('/overlay-templates'));
    this.loaded.set(true);
  }

  async create(input: OverlayTemplateInput): Promise<OverlayTemplate> {
    const template = await this.api.post<OverlayTemplate>('/overlay-templates', input);
    this.templates.update((list) => [...list, template]);
    return template;
  }

  async update(id: string, input: OverlayTemplateInput): Promise<OverlayTemplate> {
    const template = await this.api.put<OverlayTemplate>(`/overlay-templates/${id}`, input);
    this.templates.update((list) => list.map((t) => (t.id === id ? template : t)));
    return template;
  }

  setPinned(template: OverlayTemplate, pinned: boolean): Promise<OverlayTemplate> {
    const { name, type, params } = template;
    return this.update(template.id, { name, type, params, pinned });
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`/overlay-templates/${id}`);
    this.templates.update((list) => list.filter((t) => t.id !== id));
  }
}
