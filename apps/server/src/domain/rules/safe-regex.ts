import { UnsafePatternError } from '../shared/errors.js';

export const MAX_PATTERN_LENGTH = 100;
export const MAX_SUBJECT_LENGTH = 500;

/** Nested quantifiers like (a+)+ or (a*)* are the classic catastrophic-backtracking shape. */
const NESTED_QUANTIFIER = /\([^)]*[+*}][^)]*\)\s*[+*{]/;
const BACKREFERENCE = /\\[1-9]/;

/**
 * Compiles a user-supplied regex only if it passes conservative ReDoS heuristics. Subjects are
 * truncated before matching to bound the worst case further.
 */
export function compileSafeRegex(pattern: string, caseSensitive: boolean): RegExp {
  if (pattern.length > MAX_PATTERN_LENGTH) throw new UnsafePatternError(pattern);
  if (NESTED_QUANTIFIER.test(pattern) || BACKREFERENCE.test(pattern)) {
    throw new UnsafePatternError(pattern);
  }
  try {
    return new RegExp(pattern, caseSensitive ? 'u' : 'iu');
  } catch {
    throw new UnsafePatternError(pattern);
  }
}

export function testBounded(regex: RegExp, subject: string): boolean {
  return regex.test(subject.slice(0, MAX_SUBJECT_LENGTH));
}
