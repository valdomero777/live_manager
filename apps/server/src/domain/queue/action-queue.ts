export const DEFAULT_QUEUE_CAPACITY = 50;

export interface Queueable {
  readonly priority: number;
}

interface Entry<T> {
  readonly item: T;
  readonly seq: number;
}

export interface EnqueueResult<T> {
  readonly accepted: boolean;
  /** Item evicted to make room (lowest priority, oldest), if any. */
  readonly evicted?: T;
}

/**
 * Bounded priority queue: higher priority first, then arrival order. When full, the lowest
 * priority and oldest item is dropped; a new item that would itself be that one is rejected.
 */
export class ActionQueue<T extends Queueable> {
  private entries: Entry<T>[] = [];
  private seq = 0;

  constructor(private readonly capacity = DEFAULT_QUEUE_CAPACITY) {}

  enqueue(item: T): EnqueueResult<T> {
    const entry = { item, seq: this.seq++ };
    if (this.entries.length < this.capacity) {
      this.insert(entry);
      return { accepted: true };
    }
    const victimIndex = this.lowestIndex();
    const victim = this.entries[victimIndex];
    if (!victim || victim.item.priority >= item.priority) return { accepted: false };
    this.entries.splice(victimIndex, 1);
    this.insert(entry);
    return { accepted: true, evicted: victim.item };
  }

  /** Puts an item back at the front of its priority band (retry after a failed dispatch). */
  requeueFront(item: T): void {
    const entry = { item, seq: -this.seq++ };
    this.insert(entry);
  }

  dequeue(): T | undefined {
    return this.entries.shift()?.item;
  }

  clear(): T[] {
    const items = this.entries.map((e) => e.item);
    this.entries = [];
    return items;
  }

  get size(): number {
    return this.entries.length;
  }

  private insert(entry: Entry<T>): void {
    const index = this.entries.findIndex((e) => this.comesBefore(entry, e));
    if (index === -1) this.entries.push(entry);
    else this.entries.splice(index, 0, entry);
  }

  private comesBefore(a: Entry<T>, b: Entry<T>): boolean {
    if (a.item.priority !== b.item.priority) return a.item.priority > b.item.priority;
    return a.seq < b.seq;
  }

  /** Lowest priority; among equals, the oldest (smallest seq). */
  private lowestIndex(): number {
    let index = 0;
    for (let i = 1; i < this.entries.length; i++) {
      const candidate = this.entries[i];
      const current = this.entries[index];
      if (!candidate || !current) continue;
      const lower = candidate.item.priority < current.item.priority;
      const olderTie =
        candidate.item.priority === current.item.priority && candidate.seq < current.seq;
      if (lower || olderTie) index = i;
    }
    return index;
  }
}
