import { Injectable, inject, signal } from '@angular/core';
import type {
  Trigger,
  TriggerDefinition,
  TriggerDefinitionInput,
  TriggerExecuteResult,
} from '@tiklive/contracts';
import { ApiClient } from './api-client';

/** Trigger definition without id/timestamps: what PUT /triggers/:id expects. */
export function definitionOf(trigger: Trigger): TriggerDefinition {
  const { id, createdAt, updatedAt, ...definition } = trigger;
  return definition;
}

/** Sound-trigger CRUD. The server hot-reloads its trigger cache on every write. */
@Injectable({ providedIn: 'root' })
export class TriggersStore {
  private readonly api = inject(ApiClient);
  readonly triggers = signal<readonly Trigger[]>([]);

  async load(): Promise<void> {
    this.triggers.set(await this.api.get<Trigger[]>('/triggers'));
  }

  async save(id: number | undefined, definition: TriggerDefinitionInput): Promise<Trigger> {
    const trigger =
      id === undefined
        ? await this.api.post<Trigger>('/triggers', definition)
        : await this.api.put<Trigger>(`/triggers/${id}`, definition);
    await this.load();
    return trigger;
  }

  async setEnabled(trigger: Trigger, enabled: boolean): Promise<void> {
    await this.save(trigger.id, { ...definitionOf(trigger), enabled });
  }

  async delete(id: number): Promise<void> {
    await this.api.delete(`/triggers/${id}`);
    await this.load();
  }

  /** Sends the saved sound to the OBS audio screen through the real delivery path. */
  testOnAudioScreen(id: number): Promise<TriggerExecuteResult> {
    return this.api.post<TriggerExecuteResult>(`/triggers/${id}/test`);
  }
}
