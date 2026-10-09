export type Labels = Readonly<Record<string, string | number>>;

export interface Sample {
  readonly labels?: Labels;
  readonly value: number;
}

type Kind = 'counter' | 'gauge' | 'histogram';

interface Family {
  readonly kind: Kind;
  readonly help: string;
  /** Counters and histograms keep state; gauges are read from a callback at scrape time. */
  readonly series: Map<string, { labels: Labels; value: number }>;
  readonly histograms: Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >;
  readonly collect?: () => readonly Sample[];
  readonly buckets?: readonly number[];
}

/** Latency buckets in ms for the event -> action.done path. */
export const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000];

const keyOf = (labels: Labels) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',');

const escapeValue = (v: string) =>
  v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

function renderLabels(labels: Labels | undefined): string {
  const entries = Object.entries(labels ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${escapeValue(String(v))}"`).join(',')}}`;
}

/**
 * Minimal Prometheus text exposition (spec 15), with no dependency: counters, gauges read at
 * scrape time and histograms. Label sets are bounded by the app (types, reasons, rule ids).
 */
export class MetricsRegistry {
  private readonly families = new Map<string, Family>();

  counter(name: string, help: string): { inc(labels?: Labels, by?: number): void } {
    const family = this.add(name, { kind: 'counter', help });
    return {
      inc: (labels = {}, by = 1) => {
        const key = keyOf(labels);
        const entry = family.series.get(key) ?? { labels, value: 0 };
        entry.value += by;
        family.series.set(key, entry);
      },
    };
  }

  gauge(name: string, help: string, collect: () => readonly Sample[]): void {
    this.add(name, { kind: 'gauge', help, collect });
  }

  histogram(
    name: string,
    help: string,
    buckets: readonly number[] = LATENCY_BUCKETS_MS,
  ): { observe(value: number, labels?: Labels): void } {
    const family = this.add(name, { kind: 'histogram', help, buckets });
    return {
      observe: (value, labels = {}) => {
        const key = keyOf(labels);
        const entry = family.histograms.get(key) ?? {
          labels,
          counts: buckets.map(() => 0),
          sum: 0,
          count: 0,
        };
        buckets.forEach((limit, i) => {
          if (value <= limit) entry.counts[i] = (entry.counts[i] ?? 0) + 1;
        });
        entry.sum += value;
        entry.count += 1;
        family.histograms.set(key, entry);
      },
    };
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, family] of this.families) {
      lines.push(`# HELP ${name} ${family.help}`, `# TYPE ${name} ${family.kind}`);
      if (family.kind === 'histogram') this.renderHistogram(name, family, lines);
      else this.renderSamples(name, family, lines);
    }
    return `${lines.join('\n')}\n`;
  }

  private renderSamples(name: string, family: Family, lines: string[]): void {
    const samples = family.collect ? family.collect() : [...family.series.values()];
    for (const s of samples) lines.push(`${name}${renderLabels(s.labels)} ${s.value}`);
  }

  private renderHistogram(name: string, family: Family, lines: string[]): void {
    for (const h of family.histograms.values()) {
      family.buckets?.forEach((limit, i) =>
        lines.push(`${name}_bucket${renderLabels({ ...h.labels, le: limit })} ${h.counts[i] ?? 0}`),
      );
      lines.push(`${name}_bucket${renderLabels({ ...h.labels, le: '+Inf' })} ${h.count}`);
      lines.push(`${name}_sum${renderLabels(h.labels)} ${h.sum}`);
      lines.push(`${name}_count${renderLabels(h.labels)} ${h.count}`);
    }
  }

  private add(name: string, base: Pick<Family, 'kind' | 'help'> & Partial<Family>): Family {
    if (this.families.has(name)) throw new Error(`metric ${name} already registered`);
    const family: Family = { series: new Map(), histograms: new Map(), ...base };
    this.families.set(name, family);
    return family;
  }
}
