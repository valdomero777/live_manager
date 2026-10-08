/** URL parameters shared by every screen; invalid values fall back to defaults. */
export interface CommonParams {
  readonly key: string;
  readonly debug: boolean;
  readonly warnings: readonly string[];
}

const params = new URLSearchParams(location.search);

export function readCommonParams(): CommonParams {
  const key = params.get('key') ?? '';
  const warnings = key ? [] : ['Falta el parámetro ?key='];
  return { key, debug: params.get('debug') === '1', warnings };
}

export function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function readChoice<T extends string>(name: string, choices: readonly T[], fallback: T): T {
  const raw = params.get(name);
  return choices.find((c) => c === raw) ?? fallback;
}
