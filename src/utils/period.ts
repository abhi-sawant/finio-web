import { addMonths, addWeeks, addYears, format, getDate, startOfDay, startOfWeek } from 'date-fns';

/**
 * Period math for everything that asks "how much this month?".
 *
 * A "month" here is a *financial* month: it starts on `monthStartDay` rather than on the 1st,
 * so someone paid on the 25th can have budgets and dashboard totals line up with their salary
 * cycle. With the default start day of 1 every range below is the plain calendar period.
 */

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

/** Weeks run Monday–Sunday; a Sunday-start week splits the weekend across two budgets. */
export const WEEK_STARTS_ON = 1;

export const MIN_MONTH_START_DAY = 1;
/** 29–31 don't exist in every month, so a cycle can never be anchored past the 28th. */
export const MAX_MONTH_START_DAY = 28;
export const DEFAULT_MONTH_START_DAY = 1;

export const PERIOD_LABELS: Record<PeriodType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const PERIOD_TYPES: PeriodType[] = ['weekly', 'monthly', 'yearly'];

export interface PeriodRange {
  type: PeriodType;
  /** Inclusive start, at local midnight. */
  start: Date;
  /** Inclusive end — the last millisecond before the next period begins. */
  end: Date;
}

/** Coerce anything persisted or imported into a usable start day. */
export function normalizeMonthStartDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MONTH_START_DAY;
  const day = Math.trunc(value);
  if (day < MIN_MONTH_START_DAY) return MIN_MONTH_START_DAY;
  if (day > MAX_MONTH_START_DAY) return MAX_MONTH_START_DAY;
  return day;
}

/** Start of the financial month containing `date`. */
export function monthPeriodStart(date: Date, monthStartDay = DEFAULT_MONTH_START_DAY): Date {
  const day = normalizeMonthStartDay(monthStartDay);
  const anchor = startOfDay(new Date(date.getFullYear(), date.getMonth(), day));
  return getDate(date) >= day ? anchor : addMonths(anchor, -1);
}

/** Start of the financial year containing `date` — anchored to the same day-of-month in January. */
export function yearPeriodStart(date: Date, monthStartDay = DEFAULT_MONTH_START_DAY): Date {
  const day = normalizeMonthStartDay(monthStartDay);
  const anchor = startOfDay(new Date(date.getFullYear(), 0, day));
  return date.getTime() >= anchor.getTime() ? anchor : addYears(anchor, -1);
}

export function periodStart(
  type: PeriodType,
  date: Date,
  monthStartDay = DEFAULT_MONTH_START_DAY,
): Date {
  switch (type) {
    case 'weekly':
      return startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    case 'monthly':
      return monthPeriodStart(date, monthStartDay);
    case 'yearly':
      return yearPeriodStart(date, monthStartDay);
  }
}

/** Advance a canonical period start by whole periods. Safe for any delta, including negative. */
export function addPeriods(type: PeriodType, start: Date, delta: number): Date {
  switch (type) {
    case 'weekly':
      return addWeeks(start, delta);
    case 'monthly':
      return addMonths(start, delta);
    case 'yearly':
      return addYears(start, delta);
  }
}

function rangeFromStart(type: PeriodType, start: Date): PeriodRange {
  return { type, start, end: new Date(addPeriods(type, start, 1).getTime() - 1) };
}

/** The period of `type` that contains `date`. */
export function periodRange(
  type: PeriodType,
  date: Date,
  monthStartDay = DEFAULT_MONTH_START_DAY,
): PeriodRange {
  return rangeFromStart(type, periodStart(type, date, monthStartDay));
}

/** The period `delta` whole periods away from `range` (negative = earlier). */
export function shiftPeriod(range: PeriodRange, delta: number): PeriodRange {
  return rangeFromStart(range.type, addPeriods(range.type, range.start, delta));
}

export function isWithinPeriod(date: Date, range: PeriodRange): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

/** Whole days the period spans, and how many of them have started as of `now`. */
export function daysInPeriod(range: PeriodRange): number {
  return Math.max(1, Math.round((range.end.getTime() + 1 - range.start.getTime()) / 86_400_000));
}

export function daysElapsedInPeriod(range: PeriodRange, now: Date): number {
  if (now.getTime() < range.start.getTime()) return 0;
  const elapsed = Math.floor((now.getTime() - range.start.getTime()) / 86_400_000) + 1;
  return Math.min(elapsed, daysInPeriod(range));
}

/** Human label for a range: "July 2026", "25 Jun – 24 Jul 2026", "20 – 26 Jul". */
export function periodLabel(range: PeriodRange, monthStartDay = DEFAULT_MONTH_START_DAY): string {
  const day = normalizeMonthStartDay(monthStartDay);
  switch (range.type) {
    case 'weekly':
      return `${format(range.start, 'd MMM')} – ${format(range.end, 'd MMM')}`;
    case 'monthly':
      return day === MIN_MONTH_START_DAY
        ? format(range.start, 'MMMM yyyy')
        : `${format(range.start, 'd MMM')} – ${format(range.end, 'd MMM yyyy')}`;
    case 'yearly':
      return day === MIN_MONTH_START_DAY
        ? format(range.start, 'yyyy')
        : `${format(range.start, 'd MMM yyyy')} – ${format(range.end, 'd MMM yyyy')}`;
  }
}

/** Compact label for history rows, where the range is already implied by its neighbours. */
export function periodShortLabel(range: PeriodRange): string {
  switch (range.type) {
    case 'weekly':
      return format(range.start, 'd MMM');
    case 'monthly':
      return format(range.start, 'MMM');
    case 'yearly':
      return format(range.start, 'yyyy');
  }
}
