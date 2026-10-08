import type { Trigger, TriggerDefinition } from '@tiklive/contracts';

export interface TriggerRepository {
  listAll(): Promise<Trigger[]>;
  findById(id: number): Promise<Trigger | undefined>;
  create(definition: TriggerDefinition, now: number): Promise<Trigger>;
  update(id: number, definition: TriggerDefinition, now: number): Promise<Trigger | undefined>;
  delete(id: number): Promise<boolean>;
}
