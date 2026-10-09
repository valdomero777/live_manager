import { statfs } from 'node:fs/promises';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

/** The histogram's timer fires every RESOLUTION_MS, so an idle loop already reads about that. */
const RESOLUTION_MS = 20;

/** Event-loop lag since the last read (mean, ms): the earliest sign of an overloaded laptop. */
export class EventLoopLag {
  private readonly histogram: IntervalHistogram = monitorEventLoopDelay({
    resolution: RESOLUTION_MS,
  });

  constructor() {
    this.histogram.enable();
  }

  private last = 0;

  /** Mean delay in ms over the window since the previous read(); starts a new window. */
  read(): number {
    this.last = this.peek();
    this.histogram.reset();
    return this.last;
  }

  /** Mean delay so far in the current window, without ending it (used by /health). */
  peek(): number {
    const mean =
      this.histogram.count > 0 ? Math.max(0, this.histogram.mean / 1e6 - RESOLUTION_MS) : this.last;
    return Math.round(mean * 10) / 10;
  }

  dispose(): void {
    this.histogram.disable();
  }
}

/** Free space of the volume that holds `path`, as a percentage; null if it cannot be read. */
export async function diskFreePercent(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return stats.blocks === 0 ? null : Math.round((stats.bavail / stats.blocks) * 1000) / 10;
  } catch {
    return null;
  }
}
