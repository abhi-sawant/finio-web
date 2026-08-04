import { addDays, endOfWeek, format, isSameDay, startOfDay, startOfWeek } from 'date-fns';
import { roundMoney } from '@/store/balance';
import {
  getTotalExpenses,
  getTotalIncome,
  transactionCategoryAmounts,
  transactionsInPeriod,
} from './calculations';
import { netWorthAt } from './netWorth';
import {
  DEFAULT_MONTH_START_DAY,
  WEEK_STARTS_ON,
  daysElapsedInPeriod,
  daysInPeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
  type PeriodRange,
  type PeriodType,
} from './period';
import type { Account, Transaction } from '@/types';

/**
 * Period-over-period comparison and the daily spending calendar — the two "look at the same
 * numbers a different way" views. Both are pure: they take a transaction list and a window and
 * return plain data, so the components stay presentational and the maths stays testable.
 */

export interface CategoryTotal {
  categoryId: string;
  amount: number;
}

export interface PeriodSummary {
  range: PeriodRange;
  label: string;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
  /** Expense totals per category, biggest first. Split expenses count per split entry. */
  categoryTotals: CategoryTotal[];
  /** True while the period is still running, so its totals are only partial. */
  isPartial: boolean;
  /**
   * Expenses scaled up by how much of the period has elapsed. Equal to `expenses` for a
   * finished period — this is what makes a half-finished month comparable to a whole one.
   */
  projectedExpenses: number;
}

/** Totals for one window. `now` decides whether the window counts as still running. */
export function summarizePeriod(
  transactions: Transaction[],
  range: PeriodRange,
  options: { label?: string; now?: Date; monthStartDay?: number } = {},
): PeriodSummary {
  const now = options.now ?? new Date();
  const monthStartDay = options.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const rows = transactionsInPeriod(transactions, range);

  const income = roundMoney(getTotalIncome(rows));
  const expenses = roundMoney(getTotalExpenses(rows));

  const byCategory = new Map<string, number>();
  for (const t of rows) {
    if (t.type !== 'expense') continue;
    for (const { categoryId, amount } of transactionCategoryAmounts(t)) {
      byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + amount);
    }
  }

  const isPartial = now.getTime() < range.end.getTime() && now.getTime() >= range.start.getTime();
  const elapsed = daysElapsedInPeriod(range, now);
  const total = daysInPeriod(range);

  return {
    range,
    label: options.label ?? periodLabel(range, monthStartDay),
    income,
    expenses,
    net: roundMoney(income - expenses),
    transactionCount: rows.length,
    categoryTotals: Array.from(byCategory, ([categoryId, amount]) => ({
      categoryId,
      amount: roundMoney(amount),
    })).sort((a, b) => b.amount - a.amount),
    isPartial,
    projectedExpenses:
      isPartial && elapsed > 0 ? roundMoney((expenses / elapsed) * total) : expenses,
  };
}

export interface PeriodComparison {
  current: PeriodSummary;
  /** The period immediately before `current`. */
  previous: PeriodSummary;
  /**
   * The same period one year earlier — the December-vs-December view. Null for a yearly
   * comparison, where it would just be `previous` again.
   */
  lastYear: PeriodSummary | null;
}

/** How many periods back "the same period last year" sits, per period type. */
const PERIODS_PER_YEAR: Record<PeriodType, number | null> = {
  weekly: 52,
  monthly: 12,
  yearly: null,
};

/** This period vs the last one vs the same one a year ago. */
export function buildPeriodComparison(
  transactions: Transaction[],
  options: { type?: PeriodType; now?: Date; monthStartDay?: number } = {},
): PeriodComparison {
  const type = options.type ?? 'monthly';
  const now = options.now ?? new Date();
  const monthStartDay = options.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const current = periodRange(type, now, monthStartDay);
  const summarize = (range: PeriodRange) =>
    summarizePeriod(transactions, range, { now, monthStartDay });

  const yearOffset = PERIODS_PER_YEAR[type];

  return {
    current: summarize(current),
    previous: summarize(shiftPeriod(current, -1)),
    lastYear: yearOffset === null ? null : summarize(shiftPeriod(current, -yearOffset)),
  };
}

export interface CategoryMovement {
  categoryId: string;
  current: number;
  previous: number;
  /** Signed: positive means more was spent this period. */
  change: number;
  /** Null when there is nothing to divide by — the category is new this period. */
  percentChange: number | null;
}

/**
 * The categories that moved most between two periods, biggest absolute swing first.
 * Categories present in only one of the two periods count as a move from (or to) zero.
 */
export function categoryMovements(
  current: PeriodSummary,
  previous: PeriodSummary,
  limit = 5,
): CategoryMovement[] {
  const previousById = new Map(previous.categoryTotals.map((c) => [c.categoryId, c.amount]));
  const ids = new Set([...current.categoryTotals.map((c) => c.categoryId), ...previousById.keys()]);

  return Array.from(ids, (categoryId) => {
    const currentAmount =
      current.categoryTotals.find((c) => c.categoryId === categoryId)?.amount ?? 0;
    const previousAmount = previousById.get(categoryId) ?? 0;
    return {
      categoryId,
      current: currentAmount,
      previous: previousAmount,
      change: roundMoney(currentAmount - previousAmount),
      percentChange: previousAmount > 0 ? (currentAmount - previousAmount) / previousAmount : null,
    };
  })
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);
}

export interface CalendarDay {
  date: Date;
  /** `yyyy-MM-dd`, the same key the rest of the app slices dates on. */
  key: string;
  /** Total expense recorded on this day. */
  total: number;
  transactionCount: number;
  /**
   * 0–1 shading weight relative to the heaviest day in the grid. Square-rooted, so one
   * outlier month-end rent payment doesn't flatten every ordinary day to invisible.
   */
  intensity: number;
  /** False for the leading/trailing days that only exist to square off the week rows. */
  inRange: boolean;
  isFuture: boolean;
  isToday: boolean;
}

export interface SpendingCalendar {
  range: PeriodRange;
  label: string;
  /** Week rows, each exactly 7 days, Monday first — matching `WEEK_STARTS_ON`. */
  weeks: CalendarDay[][];
  total: number;
  /** The heaviest single day, which is what `intensity` is scaled against. */
  max: number;
  daysWithSpend: number;
  /** Mean spend across days that had any, rather than across the whole month. */
  averagePerActiveDay: number;
  busiest: CalendarDay | null;
}

/**
 * A month grid of daily expense totals. Days outside the period are padded in (and flagged
 * `inRange: false`) so every row is a full week.
 */
export function buildSpendingCalendar(
  transactions: Transaction[],
  range: PeriodRange,
  now = new Date(),
): SpendingCalendar {
  const byDay = new Map<string, { total: number; count: number }>();
  for (const t of transactionsInPeriod(transactions, range)) {
    if (t.type !== 'expense') continue;
    const key = t.date.slice(0, 10);
    const entry = byDay.get(key) ?? { total: 0, count: 0 };
    entry.total = roundMoney(entry.total + t.amount);
    entry.count += 1;
    byDay.set(key, entry);
  }

  const max = Array.from(byDay.values()).reduce((m, e) => Math.max(m, e.total), 0);
  const today = startOfDay(now);
  const gridStart = startOfWeek(range.start, { weekStartsOn: WEEK_STARTS_ON });
  const gridEnd = endOfWeek(range.end, { weekStartsOn: WEEK_STARTS_ON });

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    const key = format(day, 'yyyy-MM-dd');
    const inRange = day >= range.start && day <= range.end;
    const entry = inRange ? byDay.get(key) : undefined;
    const total = entry?.total ?? 0;

    week.push({
      date: day,
      key,
      total,
      transactionCount: entry?.count ?? 0,
      intensity: max > 0 && total > 0 ? 0.2 + 0.8 * Math.sqrt(total / max) : 0,
      inRange,
      isFuture: day > today,
      isToday: isSameDay(day, today),
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  const active = Array.from(byDay.values()).filter((e) => e.total > 0);
  const total = active.reduce((sum, e) => roundMoney(sum + e.total), 0);
  const busiest = weeks
    .flat()
    .filter((d) => d.inRange && d.total > 0)
    .sort((a, b) => b.total - a.total)[0];

  return {
    range,
    label: periodLabel(range),
    weeks,
    total,
    max,
    daysWithSpend: active.length,
    averagePerActiveDay: active.length > 0 ? roundMoney(total / active.length) : 0,
    busiest: busiest ?? null,
  };
}

export interface MonthTotal {
  /** `yyyy-MM` of the financial month's start. */
  key: string;
  label: string;
  income: number;
  expenses: number;
}

export interface YearInReview {
  range: PeriodRange;
  label: string;
  current: PeriodSummary;
  previous: PeriodSummary;
  /** This year's biggest expense categories, most first. */
  topCategories: CategoryTotal[];
  /** Categories that moved most against last year. */
  movers: CategoryMovement[];
  /** One entry per financial month in the year, in order. */
  monthlyBreakdown: MonthTotal[];
  /** The month with the most spending, or null for a year with none at all. */
  busiestMonth: MonthTotal | null;
  netWorthStart: number;
  netWorthEnd: number;
  netWorthChange: number;
  /** The single biggest expense of the year, or null if there wasn't one. */
  biggestExpense: Transaction | null;
}

export interface YearInReviewInput {
  transactions: Transaction[];
  accounts: Account[];
  now?: Date;
  monthStartDay?: number;
  /** 0 = the financial year in progress, negative = that many years back. */
  yearOffset?: number;
}

/**
 * A one-screen annual summary, built entirely from period math and net-worth reconstruction the
 * app already has — nothing here is persisted, so it's always as current as the ledger.
 */
export function buildYearInReview(input: YearInReviewInput): YearInReview {
  const now = input.now ?? new Date();
  const monthStartDay = input.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const yearOffset = input.yearOffset ?? 0;

  const thisYear = periodRange('yearly', now, monthStartDay);
  const range = yearOffset === 0 ? thisYear : shiftPeriod(thisYear, yearOffset);
  const previousRange = shiftPeriod(range, -1);

  const current = summarizePeriod(input.transactions, range, { now, monthStartDay });
  const previous = summarizePeriod(input.transactions, previousRange, { now, monthStartDay });
  const movers = categoryMovements(current, previous, 5);

  const firstMonth = periodRange('monthly', range.start, monthStartDay);
  const monthlyBreakdown: MonthTotal[] = Array.from({ length: 12 }, (_, i) => {
    const monthRange = shiftPeriod(firstMonth, i);
    const summary = summarizePeriod(input.transactions, monthRange, { now, monthStartDay });
    return {
      key: format(monthRange.start, 'yyyy-MM'),
      label: format(monthRange.start, 'MMM'),
      income: summary.income,
      expenses: summary.expenses,
    };
  });

  // Zero everywhere shouldn't crown January "busiest" — that's just an empty year.
  const busiestMonth = monthlyBreakdown.reduce<MonthTotal | null>(
    (best, month) => (month.expenses > 0 && (!best || month.expenses > best.expenses) ? month : best),
    null,
  );

  // Net worth "at the start of the year" is the instant before its first day; a year still in
  // progress reads its end value as of now rather than a period end that hasn't arrived yet.
  const asOfEnd = range.end.getTime() < now.getTime() ? range.end : now;
  const netWorthStart = netWorthAt(
    input.accounts,
    input.transactions,
    new Date(range.start.getTime() - 1),
  ).netWorth;
  const netWorthEnd = netWorthAt(input.accounts, input.transactions, asOfEnd).netWorth;

  const biggestExpense =
    transactionsInPeriod(input.transactions, range)
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)[0] ?? null;

  return {
    range,
    label: periodLabel(range, monthStartDay),
    current,
    previous,
    topCategories: current.categoryTotals.slice(0, 5),
    movers,
    monthlyBreakdown,
    busiestMonth,
    netWorthStart,
    netWorthEnd,
    netWorthChange: roundMoney(netWorthEnd - netWorthStart),
    biggestExpense,
  };
}
