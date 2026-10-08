/** Bounded set that evicts the least recently added key. Used to filter duplicate msgIds. */
export class LruSet {
  private readonly keys = new Set<string>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new RangeError('capacity must be >= 1');
  }

  /** Returns true when the key was new (and is now remembered). */
  add(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    if (this.keys.size > this.capacity) this.evictOldest();
    return true;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  get size(): number {
    return this.keys.size;
  }

  private evictOldest(): void {
    const oldest = this.keys.values().next();
    if (!oldest.done) this.keys.delete(oldest.value);
  }
}
