import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui's class helper: conditional classes, with later Tailwind classes winning.
 * The typography scale uses its own `type-*` utilities (styles.css), so it never collides with
 * text colors when classes are merged.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
