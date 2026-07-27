import { format, isToday, isYesterday, parseISO } from 'date-fns';

/** Finio is INR-only. */
const LOCALE = 'en-IN';
const CURRENCY = 'INR';

/**
 * Only shorten amounts at or above this magnitude. Below it, compact notation would
 * trade away precision people care about (₹1,234 → ₹1.2K) without saving any space.
 */
const COMPACT_THRESHOLD = 100_000;

export function formatCurrency(amount: number, compact = false): string {
  const useCompact = compact && Math.abs(amount) >= COMPACT_THRESHOLD;

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    notation: useCompact ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: useCompact ? 1 : 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, d MMM');
}

export function formatFullDate(dateStr: string): string {
  return format(parseISO(dateStr), 'dd MMMM yyyy');
}

export function formatTime(dateStr: string): string {
  return format(parseISO(dateStr), 'h:mm a');
}

/** Convert an ISO datetime string to the value expected by <input type="datetime-local">,
 *  expressed in the user's local timezone. */
export function toLocalDateTimeInputValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? parseISO(iso) : iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

/**
 * Format a raw numeric input string for display using the Indian number system.
 * Keeps the decimal part intact while grouping the integer part.
 * e.g. "122999" → "1,22,999", "122999.5" → "1,22,999.5"
 */
export function formatInputAmount(raw: string): string {
  if (!raw) return '0';
  const [intPart, decPart] = raw.split('.');
  const intNum = parseInt(intPart || '0', 10);
  const formatted = Number.isNaN(intNum) ? '0' : new Intl.NumberFormat(LOCALE).format(intNum);
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/** 1 → "1st", 22 → "22nd". Used for month start days. */
export function formatOrdinal(value: number): string {
  const teens = value % 100;
  if (teens >= 11 && teens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** Format a 0..1 ratio as a +/- signed percentage. */
export function formatPercentChange(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}
