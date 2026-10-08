import type { Trigger, TriggerDefinition, TriggerExecuteResult } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { TriggerRepository } from '../ports/trigger-repository.js';
import type { TriggerExecutor } from './trigger-executor.js';

/** Trigger CRUD with hot reload: every write refreshes the executor's cache. */
export class TriggerService {
  constructor(
    private readonly repo: TriggerRepository,
    private readonly executor: TriggerExecutor,
    private readonly clock: Clock,
  ) {}

  list(): Promise<Trigger[]> {
    return this.repo.listAll();
  }

  get(id: number): Promise<Trigger | undefined> {
    return this.repo.findById(id);
  }

  async create(definition: TriggerDefinition): Promise<Trigger> {
    const trigger = await this.repo.create(definition, this.clock.now());
    await this.executor.reload();
    return trigger;
  }

  async update(id: number, definition: TriggerDefinition): Promise<Trigger | undefined> {
    const trigger = await this.repo.update(id, definition, this.clock.now());
    await this.executor.reload();
    return trigger;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await this.repo.delete(id);
    await this.executor.reload();
    return deleted;
  }

  /** Sends the stored sound to the audio screen as a real event would; undefined if missing. */
  async test(id: number): Promise<TriggerExecuteResult | undefined> {
    const trigger = await this.repo.findById(id);
    if (!trigger) return undefined;
    return { status: this.executor.execute(trigger, { test: true }) };
  }
}
