import {
  MAX_OVERLAY_TEMPLATES,
  OverlayTemplateInputSchema,
  OverlayTemplateSchema,
  type OverlayTemplate,
  type OverlayTemplateInput,
} from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { IdGenerator } from '../ports/scheduler.js';
import type { SettingsRepository } from '../ports/settings-repository.js';

const STORAGE_KEY = 'overlay_templates';
const ListSchema = OverlayTemplateSchema.array();

/** Thrown when the template limit is reached; the HTTP layer maps it to 409. */
export class TemplateLimitError extends Error {
  readonly statusCode = 409;
  constructor() {
    super(`Se permiten como máximo ${MAX_OVERLAY_TEMPLATES} plantillas`);
  }
}

/**
 * Saved overlay configurations (type + URL parameters), kept as one JSON list in app_setting.
 * Writes are serialized so two quick saves never overwrite each other.
 */
export class OverlayTemplateService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly settings: SettingsRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<OverlayTemplate[]> {
    return (await this.settings.get(STORAGE_KEY, ListSchema)) ?? [];
  }

  create(input: OverlayTemplateInput): Promise<OverlayTemplate> {
    const data = OverlayTemplateInputSchema.parse(input);
    return this.mutate((list) => {
      if (list.length >= MAX_OVERLAY_TEMPLATES) throw new TemplateLimitError();
      const template = { ...data, id: this.ids.next(), updatedAt: this.clock.now() };
      return { list: [...list, template], result: template };
    });
  }

  /** Undefined when the id does not exist. */
  update(id: string, input: OverlayTemplateInput): Promise<OverlayTemplate | undefined> {
    const data = OverlayTemplateInputSchema.parse(input);
    return this.mutate((list) => {
      if (!list.some((t) => t.id === id)) return { list, result: undefined };
      const template = { ...data, id, updatedAt: this.clock.now() };
      return { list: list.map((t) => (t.id === id ? template : t)), result: template };
    });
  }

  /** False when the id does not exist. */
  remove(id: string): Promise<boolean> {
    return this.mutate((list) => {
      const next = list.filter((t) => t.id !== id);
      return { list: next, result: next.length !== list.length };
    });
  }

  private mutate<R>(
    change: (list: OverlayTemplate[]) => { list: OverlayTemplate[]; result: R },
  ): Promise<R> {
    const run = this.queue.then(async () => {
      const { list, result } = change(await this.list());
      await this.settings.set(STORAGE_KEY, list);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
