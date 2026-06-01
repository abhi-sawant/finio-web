import type { Currency } from '@/types';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

const CURRENCY_LOCALE_MAP: Record<Currency, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CAD: 'en-CA',
  AUD: 'en-AU',
};

export function formatCurrency(
  amount: number,
  currency: Currency = 'INR',
  _compact = false,
): string {
  const locale = CURRENCY_LOCALE_MAP[currency];

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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
  const formatted = Number.isNaN(intNum)
    ? '0'
    : new Intl.NumberFormat('en-IN').format(intNum);
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/** Format a 0..1 ratio as a +/- signed percentage. */
export function formatPercentChange(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}
