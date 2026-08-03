import { format, isToday, isYesterday, parseISO } from 'date-fns';

/** Finio is INR-only. */
const LOCALE = 'en-IN';
const CURRENCY = 'INR';

/**
 * Only shorten amounts at or above this magnitude. Below it, compact notation would
 * trade away precision people care about (₹1,234 → ₹1.2K) without saving any space.
 */
const COMPACT_THRESHOLD = 100_000;

/** The bare currency symbol/prefix Intl would render for 0, e.g. "₹". Cached — it never changes. */
const CURRENCY_PREFIX =
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? '₹';

export function formatCurrency(
  amount: number,
  compact = false,
  hidden = false,
  options: { precise?: boolean; forceCompact?: boolean } = {},
): string {
  if (hidden) return `${amount < 0 ? '-' : ''}${CURRENCY_PREFIX}••••`;

  // `compact` alone is gated per-value by COMPACT_THRESHOLD (see above). `forceCompact: true`
  // skips that gate — it's how a *group* of amounts (see `shouldCompactGroup`) renders every
  // member compact once any one of them crosses the threshold, rather than each value deciding
  // alone. `forceCompact: false`/absent falls through to the normal per-value gate.
  const useCompact =
    options.forceCompact === true || (compact && Math.abs(amount) >= COMPACT_THRESHOLD);
  // Derived/projected figures (daily averages, forecasts, insight copy) are never exact to
  // the rupee anyway, so paise there just add noise — pass { precise: false } to round them.
  const precise = options.precise ?? true;

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    notation: useCompact ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: useCompact ? 1 : precise ? 2 : 0,
  }).format(amount);
}

/**
 * Whether a *group* of related amounts should render compact. Compacting each value on its
 * own splits sets meant to be compared at a glance — Income ₹2.3L beside Expenses ₹90,010 —
 * so a group compacts together (pass the result as `forceCompact`) the moment any one member
 * crosses the threshold.
 */
export function shouldCompactGroup(amounts: number[]): boolean {
  return amounts.some((amount) => Math.abs(amount) >= COMPACT_THRESHOLD);
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

/** Format a byte count as a human-readable size, e.g. 2_400 → "2.3 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Format a 0..1 ratio as a +/- signed percentage. */
export function formatPercentChange(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}
