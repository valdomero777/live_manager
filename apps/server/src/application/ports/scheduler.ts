export type Cancel = () => void;

/** Timer port so time-based logic can be driven by a fake in tests. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): Cancel;
  setInterval(fn: () => void, ms: number): Cancel;
}

export interface IdGenerator {
  next(): string;
}
