import {
  parseISO,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  subMonths,
  getDaysInMonth,
  getDate,
} from 'date-fns';
import type { Transaction, Account, Budget, Category } from '@/types';

export function getTotalIncome(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
}

export function getTotalExpenses(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
}

export function getTotalAccountBalance(accounts: Account[]): number {
  return accounts.filter((a) => a.type !== 'credit').reduce((sum, a) => sum + a.balance, 0);
}

export function getNetWorth(accounts: Account[]): number {
  // Includes credit (negative balances reduce net worth)
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

export function getTotalCreditOutstanding(accounts: Account[]): number {
  return accounts
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + Math.abs(Math.min(a.balance, 0)), 0);
}

export function getCurrentMonthTransactions(transactions: Transaction[]): Transaction[] {
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return transactions.filter((t) => {
    const date = parseISO(t.date);
    return isWithinInterval(date, { start, end });
  });
}

export function getMonthTransactions(transactions: Transaction[], monthDate: Date): Transaction[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return transactions.filter((t) => {
    const date = parseISO(t.date);
    return isWithinInterval(date, { start, end });
  });
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

/** Sort copy of transactions by date desc. */
export function sortTransactionsDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percent: number;
  isOver: boolean;
}

export function computeBudgetStatuses(
  budgets: Budget[],
  monthTxns: Transaction[],
): BudgetStatus[] {
  const expenseTxns = monthTxns.filter((t) => t.type === 'expense');
  const totalExpenses = expenseTxns.reduce((sum, t) => sum + t.amount, 0);
  const byCat = new Map<string, number>();
  for (const t of expenseTxns) {
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
  }

  return budgets.map((b) => {
    const spent = b.categoryId === '' ? totalExpenses : (byCat.get(b.categoryId) ?? 0);
    const remaining = b.amount - spent;
    const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    return {
      budget: b,
      spent,
      remaining,
      percent,
      isOver: spent > b.amount,
    };
  });
}

export interface DashboardQuickStats {
  dailyAverage: number;
  projectedMonth: number;
  biggestExpense: Transaction | null;
  topCategory: { category: Category; amount: number } | null;
  monthOverMonthChange: number; // -1..+inf, e.g. 0.12 = +12%
  savingsRate: number; // (income - expense) / income, 0 when income == 0
}

export function getDashboardStats(
  monthTxns: Transaction[],
  previousMonthTxns: Transaction[],
  categories: Category[],
): DashboardQuickStats {
  const expenses = monthTxns.filter((t) => t.type === 'expense');
  const income = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expensesTotal = expenses.reduce((s, t) => s + t.amount, 0);

  const now = new Date();
  const dayOfMonth = getDate(now);
  const daysInMonth = getDaysInMonth(now);
  const dailyAverage = dayOfMonth > 0 ? expensesTotal / dayOfMonth : 0;
  const projectedMonth = dailyAverage * daysInMonth;

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
  const monthOverMonthChange =
    prevExpenses > 0 ? (expensesTotal - prevExpenses) / prevExpenses : 0;

  const savingsRate = income > 0 ? Math.max(0, (income - expensesTotal) / income) : 0;

  return {
    dailyAverage,
    projectedMonth,
    biggestExpense,
    topCategory,
    monthOverMonthChange,
    savingsRate,
  };
}

export function getPreviousMonthTransactions(transactions: Transaction[]): Transaction[] {
  return getMonthTransactions(transactions, subMonths(new Date(), 1));
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
  const header = [
    'Date',
    'Type',
    'Amount',
    'Account',
    'To Account',
    'Category',
    'Note',
  ].join(',');
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

