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
  compact = false,
): string {
  const locale = CURRENCY_LOCALE_MAP[currency];

  if (compact && Math.abs(amount) >= 100000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }

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

/** Format a 0..1 ratio as a +/- signed percentage. */
export function formatPercentChange(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}
