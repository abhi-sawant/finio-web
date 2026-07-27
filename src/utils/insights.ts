import { addDays, addMonths, addWeeks, addYears, format, parseISO } from 'date-fns';
import { roundMoney } from '@/store/balance';
import {
  budgetScopeKey,
  computeBudgetStatuses,
  getTotalExpenses,
  getTotalIncome,
  transactionCategoryAmounts,
  transactionsInPeriod,
} from './calculations';
import {
  DEFAULT_MONTH_START_DAY,
  daysElapsedInPeriod,
  daysInPeriod,
  periodRange,
  shiftPeriod,
  type PeriodRange,
} from './period';
import type {
  Budget,
  Category,
  Label,
  RecurrenceFrequency,
  RecurringTransaction,
  Transaction,
} from '@/types';

/**
 * The insights feed — "Food is 40% above your 3-month average", "three ₹499 charges from
 * Spotify, want a recurring rule?".
 *
 * Everything here is derived on the fly from the ledger; nothing is persisted, so an insight
 * disappears the moment the transaction behind it changes. Money never appears in the copy
 * directly: callers pass a `formatAmount` so the same builder can honour the app-wide
 * hide-amounts toggle instead of leaking figures the user has chosen to mask.
 */

export type InsightKind =
  | 'category-spike'
  | 'category-drop'
  | 'subscription'
  | 'budget-over'
  | 'budget-pace'
  | 'savings-rate'
  | 'category-share';

export type InsightSeverity = 'warn' | 'info' | 'good';

export type InsightAction =
  | { type: 'create-recurring'; candidate: SubscriptionCandidate }
  | { type: 'navigate'; to: string; label: string };

export interface Insight {
  /** Stable across rebuilds for the same underlying fact — usable as a React key. */
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: InsightAction;
}

export interface SubscriptionCandidate {
  /** The normalized note the group was matched on. */
  key: string;
  /** The most recent raw note, i.e. what the user actually typed. */
  note: string;
  amount: number;
  frequency: RecurrenceFrequency;
  occurrences: number;
  accountId: string;
  categoryId: string;
  labels: string[];
  /** ISO date of the most recent charge. */
  lastDate: string;
  /**
   * ISO date of the next expected charge, always in the future — a recurring rule created from
   * this candidate must not backfill the charges that are already in the ledger.
   */
  nextDate: string;
}

/** Charges must repeat at least this many times before they look like a subscription. */
const MIN_SUBSCRIPTION_OCCURRENCES = 3;

/** How far back subscription detection looks. */
const SUBSCRIPTION_LOOKBACK_DAYS = 400;

/** Amounts count as "the same charge" within this fraction of each other. */
const AMOUNT_TOLERANCE = 0.05;

/** Absolute slack for small amounts, where 5% is less than a rupee or two. */
const AMOUNT_TOLERANCE_FLOOR = 2;

/** Day gaps that read as a given cadence. Fortnightly and quarterly have no rule frequency. */
const CADENCE_WINDOWS: Array<{ frequency: RecurrenceFrequency; min: number; max: number }> = [
  { frequency: 'weekly', min: 6, max: 8 },
  { frequency: 'monthly', min: 26, max: 35 },
  { frequency: 'yearly', min: 350, max: 380 },
];

/**
 * A note reduced to its recognisable core: lowercased, with digits and punctuation stripped, so
 * "UPI/Spotify/9921" and "Spotify 449" land in the same bucket.
 */
export function normalizeNote(note: string): string {
  return note
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function advanceByFrequency(date: Date, frequency: RecurrenceFrequency): Date {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Expenses that repeat on a regular cadence for a near-identical amount and aren't already
 * covered by a recurring rule — i.e. subscriptions the app could be tracking but isn't.
 *
 * Only plain, noted, non-split expenses qualify: a split receipt isn't one recurring charge,
 * and a rule generated from a blank note would be unidentifiable.
 */
export function detectSubscriptions(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  now = new Date(),
): SubscriptionCandidate[] {
  const from = addDays(now, -SUBSCRIPTION_LOOKBACK_DAYS);
  const covered = new Set(
    recurring.map((rule) => normalizeNote(rule.note)).filter((key) => key !== ''),
  );

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.recurringId || t.splits) continue;
    const key = normalizeNote(t.note);
    if (key === '' || covered.has(key)) continue;
    const date = parseISO(t.date);
    if (Number.isNaN(date.getTime()) || date < from || date > now) continue;

    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [key, rows] of groups) {
    if (rows.length < MIN_SUBSCRIPTION_OCCURRENCES) continue;

    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => t.amount);
    const typical = median(amounts);
    const slack = Math.max(typical * AMOUNT_TOLERANCE, AMOUNT_TOLERANCE_FLOOR);
    if (amounts.some((amount) => Math.abs(amount - typical) > slack)) continue;

    const dates = sorted.map((t) => parseISO(t.date));
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000);
    }
    const cadence = CADENCE_WINDOWS.find((window) =>
      gaps.every((gap) => gap >= window.min && gap <= window.max),
    );
    if (!cadence) continue;

    const latest = sorted[sorted.length - 1];
    let next = advanceByFrequency(parseISO(latest.date), cadence.frequency);
    // Never hand back a start date in the past: a rule created from it would immediately
    // backfill charges that are already sitting in the ledger.
    while (next <= now) next = advanceByFrequency(next, cadence.frequency);

    candidates.push({
      key,
      note: latest.note,
      amount: roundMoney(typical),
      frequency: cadence.frequency,
      occurrences: sorted.length,
      accountId: latest.accountId,
      categoryId: latest.categoryId,
      labels: [...latest.labels],
      lastDate: latest.date,
      nextDate: next.toISOString(),
    });
  }

  // Biggest annualised spend first — that is the one worth automating.
  const annualWeight: Record<RecurrenceFrequency, number> = {
    daily: 365,
    weekly: 52,
    monthly: 12,
    yearly: 1,
  };
  return candidates.sort(
    (a, b) => b.amount * annualWeight[b.frequency] - a.amount * annualWeight[a.frequency],
  );
}

export interface InsightInput {
  transactions: Transaction[];
  categories: Category[];
  labels: Label[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  now?: Date;
  monthStartDay?: number;
  /** Maximum insights returned. */
  limit?: number;
}

export interface InsightOptions {
  /** Renders money inside insight copy. Pass one that honours the hide-amounts setting. */
  formatAmount: (value: number) => string;
}

/** Months of completed history the "vs your average" comparisons are drawn from. */
const BASELINE_MONTHS = 3;

/** A baseline needs at least this many of those months to have been in use. */
const MIN_BASELINE_MONTHS = 2;

/** Below this, a percentage swing is arithmetic noise rather than a change in behaviour. */
const MIN_NOTABLE_AMOUNT = 500;

/** How far a category must move against its baseline to be worth saying out loud. */
const NOTABLE_CHANGE = 0.25;

const SEVERITY_ORDER: Record<InsightSeverity, number> = { warn: 0, info: 1, good: 2 };

function categorySpend(rows: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of rows) {
    if (t.type !== 'expense') continue;
    for (const { categoryId, amount } of transactionCategoryAmounts(t)) {
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + amount);
    }
  }
  return totals;
}

/** Expenses scaled to the whole period by how much of it has elapsed. */
function paceToFullPeriod(amount: number, range: PeriodRange, now: Date): number {
  const elapsed = daysElapsedInPeriod(range, now);
  if (elapsed <= 0) return amount;
  return roundMoney((amount / elapsed) * daysInPeriod(range));
}

/**
 * Everything worth telling the user about this month, most urgent first: categories running
 * away from their own average, budgets that are over or on pace to be, an unhealthy savings
 * rate, and repeated charges that ought to be recurring rules.
 */
export function buildInsights(input: InsightInput, options: InsightOptions): Insight[] {
  const now = input.now ?? new Date();
  const monthStartDay = input.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const money = options.formatAmount;
  const limit = input.limit ?? 6;

  const range = periodRange('monthly', now, monthStartDay);
  const periodKey = format(range.start, 'yyyy-MM');
  const rows = transactionsInPeriod(input.transactions, range);
  const insights: Insight[] = [];

  const categoryName = (id: string) =>
    input.categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  // ── Categories against their own recent average ──────────────────────────
  const priorMonths = Array.from({ length: BASELINE_MONTHS }, (_, i) =>
    transactionsInPeriod(input.transactions, shiftPeriod(range, -(i + 1))),
  ).filter((month) => month.length > 0);

  if (priorMonths.length >= MIN_BASELINE_MONTHS) {
    const baselines = new Map<string, number>();
    for (const month of priorMonths) {
      for (const [categoryId, amount] of categorySpend(month)) {
        baselines.set(categoryId, (baselines.get(categoryId) ?? 0) + amount);
      }
    }

    const current = categorySpend(rows);
    const movements: Array<{
      categoryId: string;
      projected: number;
      baseline: number;
      change: number;
    }> = [];

    for (const [categoryId, baselineTotal] of baselines) {
      const baseline = roundMoney(baselineTotal / priorMonths.length);
      if (baseline < MIN_NOTABLE_AMOUNT) continue;
      // Pace-adjusted, or a month that is three days old always reads as a collapse in spending.
      const projected = paceToFullPeriod(current.get(categoryId) ?? 0, range, now);
      const change = (projected - baseline) / baseline;
      if (Math.abs(change) < NOTABLE_CHANGE) continue;
      movements.push({ categoryId, projected, baseline, change });
    }

    movements.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    for (const move of movements.filter((m) => m.change > 0).slice(0, 2)) {
      insights.push({
        id: `spike:${move.categoryId}:${periodKey}`,
        kind: 'category-spike',
        severity: 'warn',
        title: `${categoryName(move.categoryId)} is ${Math.round(move.change * 100)}% above your ${priorMonths.length}-month average`,
        detail: `On pace for ${money(move.projected)} this month, against ${money(move.baseline)} on average.`,
      });
    }

    const biggestDrop = movements.filter((m) => m.change < 0)[0];
    if (biggestDrop) {
      insights.push({
        id: `drop:${biggestDrop.categoryId}:${periodKey}`,
        kind: 'category-drop',
        severity: 'good',
        title: `${categoryName(biggestDrop.categoryId)} is down ${Math.round(Math.abs(biggestDrop.change) * 100)}% on your average`,
        detail: `On pace for ${money(biggestDrop.projected)} this month, against ${money(biggestDrop.baseline)} on average.`,
      });
    }
  }

  // ── Budgets ──────────────────────────────────────────────────────────────
  const budgetName = (budget: Budget) => {
    if (budget.labelId) {
      return input.labels.find((l) => l.id === budget.labelId)?.name ?? 'Unknown label';
    }
    return budget.categoryId === '' ? 'Overall spending' : categoryName(budget.categoryId);
  };

  const statuses = computeBudgetStatuses(input.budgets, input.transactions, {
    monthStartDay,
    now,
  });

  const overBudget = statuses.filter((s) => s.isOver).sort((a, b) => b.percent - a.percent);
  for (const status of overBudget.slice(0, 2)) {
    insights.push({
      id: `budget-over:${budgetScopeKey(status.budget)}:${periodKey}`,
      kind: 'budget-over',
      severity: 'warn',
      title: `${budgetName(status.budget)} is over budget`,
      detail: `${money(status.spent)} spent against a ${money(status.limit)} limit.`,
      action: { type: 'navigate', to: '/budgets', label: 'Review budgets' },
    });
  }

  const onPace = statuses
    .filter((s) => !s.isOver && paceToFullPeriod(s.spent, s.range, now) > s.limit && s.limit > 0)
    .sort((a, b) => b.percent - a.percent);
  for (const status of onPace.slice(0, 1)) {
    insights.push({
      id: `budget-pace:${budgetScopeKey(status.budget)}:${periodKey}`,
      kind: 'budget-pace',
      severity: 'warn',
      title: `${budgetName(status.budget)} is on pace to go over`,
      detail: `At this rate you'll spend ${money(paceToFullPeriod(status.spent, status.range, now))} against a ${money(status.limit)} limit.`,
      action: { type: 'navigate', to: '/budgets', label: 'Review budgets' },
    });
  }

  // ── Subscription detection ───────────────────────────────────────────────
  for (const candidate of detectSubscriptions(input.transactions, input.recurring, now).slice(
    0,
    2,
  )) {
    const cadence =
      candidate.frequency === 'monthly'
        ? 'monthly'
        : candidate.frequency === 'weekly'
          ? 'weekly'
          : 'yearly';
    insights.push({
      id: `subscription:${candidate.key}`,
      kind: 'subscription',
      severity: 'info',
      title: `${candidate.occurrences} ${money(candidate.amount)} charges from "${candidate.note}"`,
      detail: `Looks like a ${cadence} subscription. Track it as a recurring rule so it shows up in upcoming bills and the forecast.`,
      action: { type: 'create-recurring', candidate },
    });
  }

  // ── Savings rate ─────────────────────────────────────────────────────────
  const income = getTotalIncome(rows);
  const expenses = getTotalExpenses(rows);
  if (income > 0) {
    const savingsRate = (income - expenses) / income;
    if (savingsRate < 0) {
      insights.push({
        id: `savings-negative:${periodKey}`,
        kind: 'savings-rate',
        severity: 'warn',
        title: `You've spent ${money(roundMoney(expenses - income))} more than you earned this month`,
        detail: `${money(expenses)} out against ${money(income)} in.`,
      });
    } else if (savingsRate >= 0.2) {
      insights.push({
        id: `savings-good:${periodKey}`,
        kind: 'savings-rate',
        severity: 'good',
        title: `You're saving ${Math.round(savingsRate * 100)}% of your income this month`,
        detail: `${money(roundMoney(income - expenses))} kept from ${money(income)} earned.`,
      });
    }
  }

  // ── Concentration ────────────────────────────────────────────────────────
  if (expenses >= MIN_NOTABLE_AMOUNT * 2) {
    const [top] = Array.from(categorySpend(rows)).sort((a, b) => b[1] - a[1]);
    if (top && top[1] / expenses >= 0.4) {
      insights.push({
        id: `share:${top[0]}:${periodKey}`,
        kind: 'category-share',
        severity: 'info',
        title: `${categoryName(top[0])} is ${Math.round((top[1] / expenses) * 100)}% of this month's spending`,
        detail: `${money(roundMoney(top[1]))} of ${money(expenses)} total.`,
      });
    }
  }

  return insights
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, limit);
}
