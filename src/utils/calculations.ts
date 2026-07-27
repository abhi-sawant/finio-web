import { parseISO } from 'date-fns';
import {
  DEFAULT_MONTH_START_DAY,
  daysElapsedInPeriod,
  daysInPeriod,
  isWithinPeriod,
  periodRange,
  periodStart,
  shiftPeriod,
  type PeriodRange,
} from './period';
import type { Transaction, Account, Budget, Category, Label } from '@/types';

export function getTotalIncome(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
}

export function getTotalExpenses(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Accounts still in use. Archived (closed) accounts keep their history but are excluded from
 * every running total and picker — filtering here keeps that rule in one place.
 */
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archivedAt);
}

export function getTotalAccountBalance(accounts: Account[]): number {
  return activeAccounts(accounts)
    .filter((a) => a.type !== 'credit')
    .reduce((sum, a) => sum + a.balance, 0);
}

export function getNetWorth(accounts: Account[]): number {
  // Includes credit (negative balances reduce net worth)
  return activeAccounts(accounts).reduce((sum, a) => sum + a.balance, 0);
}

export function getTotalCreditOutstanding(accounts: Account[]): number {
  return activeAccounts(accounts)
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + Math.abs(Math.min(a.balance, 0)), 0);
}

export function transactionsInPeriod(
  transactions: Transaction[],
  range: PeriodRange,
): Transaction[] {
  return transactions.filter((t) => {
    const date = parseISO(t.date);
    return !Number.isNaN(date.getTime()) && isWithinPeriod(date, range);
  });
}

/**
 * "This month" everywhere in the app. With a `monthStartDay` other than 1 the window is the
 * user's salary cycle rather than the calendar month.
 */
export function getCurrentMonthTransactions(
  transactions: Transaction[],
  monthStartDay = DEFAULT_MONTH_START_DAY,
): Transaction[] {
  return transactionsInPeriod(transactions, periodRange('monthly', new Date(), monthStartDay));
}

export function getMonthTransactions(
  transactions: Transaction[],
  monthDate: Date,
  monthStartDay = DEFAULT_MONTH_START_DAY,
): Transaction[] {
  return transactionsInPeriod(transactions, periodRange('monthly', monthDate, monthStartDay));
}

export function groupTransactionsByDate(
  transactions: Transaction[],
): Array<{ date: string; transactions: Transaction[] }> {
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const map = new Map<string, Transaction[]>();

  for (const t of sorted) {
    const dateKey = t.date.slice(0, 10);
    const existing = map.get(dateKey);
    if (existing) {
      existing.push(t);
    } else {
      map.set(dateKey, [t]);
    }
  }

  return Array.from(map.entries()).map(([date, txs]) => ({ date, transactions: txs }));
}

/**
 * Lookup tables for `transactionMatchesQuery`, built once per search rather than per row.
 * Every name is pre-lowercased so matching is a plain `includes`.
 */
export interface SearchIndex {
  categoryNames: Map<string, string>;
  accountNames: Map<string, string>;
  labelNames: Map<string, string>;
}

export function buildSearchIndex(
  categories: Category[],
  accounts: Account[],
  labels: Label[],
): SearchIndex {
  return {
    categoryNames: new Map(categories.map((c) => [c.id, c.name.toLowerCase()])),
    accountNames: new Map(accounts.map((a) => [a.id, a.name.toLowerCase()])),
    labelNames: new Map(labels.map((l) => [l.id, l.name.toLowerCase()])),
  };
}

/**
 * Match a transaction against a free-text query across note, category, account (both
 * sides of a transfer), labels, and amount.
 *
 * Amounts are compared digit-wise against the raw number, so a query typed with
 * grouping or a currency symbol ("₹1,200") still finds `1200`.
 */
export function transactionMatchesQuery(
  transaction: Transaction,
  rawQuery: string,
  index: SearchIndex,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  if (transaction.note.toLowerCase().includes(q)) return true;
  if (index.categoryNames.get(transaction.categoryId)?.includes(q)) return true;
  if (index.accountNames.get(transaction.accountId)?.includes(q)) return true;
  if (transaction.toAccountId && index.accountNames.get(transaction.toAccountId)?.includes(q)) {
    return true;
  }
  for (const labelId of transaction.labels) {
    if (index.labelNames.get(labelId)?.includes(q)) return true;
  }

  const numeric = q.replace(/[^\d.]/g, '');
  if (numeric && numeric !== '.' && transaction.amount.toString().includes(numeric)) return true;

  return false;
}

/** Sort copy of transactions by date desc. */
export function sortTransactionsDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** How many past periods a rollover chain is allowed to accumulate over. */
export const MAX_ROLLOVER_LOOKBACK = 12;

export interface BudgetPeriodOptions {
  monthStartDay?: number;
  /** Overridable for tests and for previewing a period other than the live one. */
  now?: Date;
}

/** Identifies what a budget is a limit *for*. Two budgets may not share one scope. */
export function budgetScopeKey(budget: Pick<Budget, 'categoryId' | 'labelId'>): string {
  return budget.labelId ? `label:${budget.labelId}` : `category:${budget.categoryId}`;
}

/** Does this expense count against the budget? Income and transfers never do. */
export function budgetMatchesTransaction(
  budget: Pick<Budget, 'categoryId' | 'labelId'>,
  transaction: Transaction,
): boolean {
  if (transaction.type !== 'expense') return false;
  if (budget.labelId) return transaction.labels.includes(budget.labelId);
  if (budget.categoryId === '') return true;
  return transaction.categoryId === budget.categoryId;
}

export interface BudgetPeriodResult {
  range: PeriodRange;
  spent: number;
  /** `budget.amount`, plus any rollover carried into this period. */
  limit: number;
  isOver: boolean;
}

export interface BudgetStatus extends BudgetPeriodResult {
  budget: Budget;
  /** Unspent (or, when negative, overspent) amount carried in. Always 0 without rollover. */
  carryover: number;
  remaining: number;
  percent: number;
}

/**
 * The periods before `currentRange` that a rollover chain runs through, oldest first — never
 * reaching back past the period the budget was created in.
 */
function priorPeriods(
  budget: Budget,
  matching: Transaction[],
  currentRange: PeriodRange,
  monthStartDay: number,
  lookback: number,
): BudgetPeriodResult[] {
  const created = parseISO(budget.createdAt);
  const createdStart = Number.isNaN(created.getTime())
    ? currentRange.start
    : periodStart(budget.period, created, monthStartDay);

  const ranges: PeriodRange[] = [];
  let cursor = shiftPeriod(currentRange, -1);
  while (ranges.length < lookback && cursor.start.getTime() >= createdStart.getTime()) {
    ranges.push(cursor);
    cursor = shiftPeriod(cursor, -1);
  }
  ranges.reverse();

  let carry = 0;
  return ranges.map((range) => {
    const limit = budget.amount + (budget.rollover ? carry : 0);
    const spent = sumAmounts(transactionsInPeriod(matching, range));
    if (budget.rollover) carry = limit - spent;
    return { range, spent, limit, isOver: spent > limit };
  });
}

function sumAmounts(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Status of every budget in its *own* current period — weekly, monthly (aligned to
 * `monthStartDay`) or yearly. Takes the full transaction list rather than a pre-filtered
 * month, because each budget now defines its own window.
 */
export function computeBudgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  options: BudgetPeriodOptions = {},
): BudgetStatus[] {
  const now = options.now ?? new Date();
  const monthStartDay = options.monthStartDay ?? DEFAULT_MONTH_START_DAY;

  return budgets.map((budget) => {
    const matching = transactions.filter((t) => budgetMatchesTransaction(budget, t));
    const range = periodRange(budget.period, now, monthStartDay);
    const spent = sumAmounts(transactionsInPeriod(matching, range));

    let carryover = 0;
    if (budget.rollover) {
      const priors = priorPeriods(budget, matching, range, monthStartDay, MAX_ROLLOVER_LOOKBACK);
      const previous = priors[priors.length - 1];
      if (previous) carryover = previous.limit - previous.spent;
    }

    const limit = budget.amount + carryover;
    const remaining = limit - spent;
    return {
      budget,
      range,
      spent,
      carryover,
      limit,
      remaining,
      percent: limit > 0 ? (spent / limit) * 100 : 0,
      isOver: spent > limit,
    };
  });
}

/**
 * How this budget did over its recent completed periods — "did I hit it last month?" —
 * most recent first.
 */
export function computeBudgetHistory(
  budget: Budget,
  transactions: Transaction[],
  options: BudgetPeriodOptions = {},
  count = 6,
): BudgetPeriodResult[] {
  const now = options.now ?? new Date();
  const monthStartDay = options.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const matching = transactions.filter((t) => budgetMatchesTransaction(budget, t));
  const range = periodRange(budget.period, now, monthStartDay);
  // Walk the full rollover window so carried-over limits are right, then show the tail.
  const lookback = Math.max(count, budget.rollover ? MAX_ROLLOVER_LOOKBACK : count);
  const priors = priorPeriods(budget, matching, range, monthStartDay, lookback);
  return priors.slice(-count).reverse();
}

export interface DashboardQuickStats {
  dailyAverage: number;
  projectedMonth: number;
  biggestExpense: Transaction | null;
  topCategory: { category: Category; amount: number } | null;
  monthOverMonthChange: number; // -1..+inf, e.g. 0.12 = +12%
  /** (income - expense) / income. Negative when overspending; 0 when income == 0. */
  savingsRate: number;
}

export function getDashboardStats(
  monthTxns: Transaction[],
  previousMonthTxns: Transaction[],
  categories: Category[],
  options: BudgetPeriodOptions = {},
): DashboardQuickStats {
  const expenses = monthTxns.filter((t) => t.type === 'expense');
  const income = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expensesTotal = expenses.reduce((s, t) => s + t.amount, 0);

  const now = options.now ?? new Date();
  // Pace the average against the *cycle* the totals cover, not the calendar month, or a
  // 25th-to-24th cycle reads as a fresh month every 1st.
  const range = periodRange('monthly', now, options.monthStartDay ?? DEFAULT_MONTH_START_DAY);
  const elapsed = daysElapsedInPeriod(range, now);
  const dailyAverage = elapsed > 0 ? expensesTotal / elapsed : 0;
  const projectedMonth = dailyAverage * daysInPeriod(range);

  let biggestExpense: Transaction | null = null;
  for (const t of expenses) {
    if (!biggestExpense || t.amount > biggestExpense.amount) biggestExpense = t;
  }

  const byCat = new Map<string, number>();
  for (const t of expenses) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
  let topCategory: { category: Category; amount: number } | null = null;
  for (const [catId, amount] of byCat) {
    const category = categories.find((c) => c.id === catId);
    if (!category) continue;
    if (!topCategory || amount > topCategory.amount) topCategory = { category, amount };
  }

  const prevExpenses = previousMonthTxns
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthOverMonthChange = prevExpenses > 0 ? (expensesTotal - prevExpenses) / prevExpenses : 0;

  // Deliberately not clamped: a month where spending exceeds income should read as
  // negative, not as a flat 0%.
  const savingsRate = income > 0 ? (income - expensesTotal) / income : 0;

  return {
    dailyAverage,
    projectedMonth,
    biggestExpense,
    topCategory,
    monthOverMonthChange,
    savingsRate,
  };
}

export function getPreviousMonthTransactions(
  transactions: Transaction[],
  monthStartDay = DEFAULT_MONTH_START_DAY,
): Transaction[] {
  const previous = shiftPeriod(periodRange('monthly', new Date(), monthStartDay), -1);
  return transactionsInPeriod(transactions, previous);
}

/** Convert transactions to CSV string. */
export function transactionsToCsv(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['Date', 'Type', 'Amount', 'Account', 'To Account', 'Category', 'Note'].join(',');
  const rows = transactions.map((t) =>
    [
      t.date,
      t.type,
      t.amount.toString(),
      escape(accMap.get(t.accountId) ?? ''),
      escape(t.toAccountId ? (accMap.get(t.toAccountId) ?? '') : ''),
      escape(catMap.get(t.categoryId) ?? ''),
      escape(t.note ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}
