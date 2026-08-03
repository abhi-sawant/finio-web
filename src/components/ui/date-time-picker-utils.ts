import { format, parse } from 'date-fns';

/**
 * Parse the value used by `<input type="datetime-local">` (e.g., "2026-05-27T14:30")
 * into a Date in local time. Returns null for empty/invalid input.
 */
export function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as the value used by `<input type="datetime-local">`. */
export function formatDateTimeLocal(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
