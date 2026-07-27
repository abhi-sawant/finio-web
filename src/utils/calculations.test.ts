import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  computeBudgetStatuses,
  getDashboardStats,
  transactionMatchesQuery,
} from './calculations';
import type { Account, Budget, Category, Label, Transaction } from '@/types';

function tx(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  return {
    id: partial.id ?? `tx-${partial.type}-${partial.amount}`,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    date: '2026-06-05T00:00:00.000Z',
    note: '',
    labels: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    ...partial,
  };
}

function budget(categoryId: string, amount: number): Budget {
  return { id: `b-${categoryId}`, categoryId, amount, createdAt: '2026-01-01T00:00:00.000Z' };
}

const categories: Category[] = [
  { id: 'cat-1', name: 'Food', icon: 'utensils', color: '#ef4444', type: 'expense' },
  { id: 'cat-2', name: 'Transport', icon: 'car', color: '#f97316', type: 'expense' },
];

describe('computeBudgetStatuses', () => {
  const monthTxns = [
    tx({ type: 'expense', amount: 300, categoryId: 'cat-1' }),
    tx({ type: 'expense', amount: 200, categoryId: 'cat-1', id: 'tx-2' }),
    tx({ type: 'expense', amount: 100, categoryId: 'cat-2' }),
    tx({ type: 'income', amount: 5000, categoryId: 'cat-9' }),
    tx({ type: 'transfer', amount: 900, toAccountId: 'acc-2' }),
  ];

  it('sums spending per category and ignores income and transfers', () => {
    const [food] = computeBudgetStatuses([budget('cat-1', 1000)], monthTxns);
    expect(food.spent).toBe(500);
    expect(food.remaining).toBe(500);
    expect(food.percent).toBe(50);
    expect(food.isOver).toBe(false);
  });

  it('treats an empty categoryId as the overall budget across all expenses', () => {
    const [overall] = computeBudgetStatuses([budget('', 1000)], monthTxns);
    expect(overall.spent).toBe(600);
  });

  it('flags an exceeded budget and reports negative remaining', () => {
    const [tight] = computeBudgetStatuses([budget('cat-1', 400)], monthTxns);
    expect(tight.isOver).toBe(true);
    expect(tight.remaining).toBe(-100);
    expect(tight.percent).toBe(125);
  });

  it('does not report over-budget when spending exactly matches the limit', () => {
    const [exact] = computeBudgetStatuses([budget('cat-1', 500)], monthTxns);
    expect(exact.isOver).toBe(false);
    expect(exact.percent).toBe(100);
  });

  it('reports zero percent instead of Infinity for a zero-amount budget', () => {
    const [zero] = computeBudgetStatuses([budget('cat-1', 0)], monthTxns);
    expect(zero.percent).toBe(0);
  });

  it('reports zero spend for a category with no transactions', () => {
    const [unused] = computeBudgetStatuses([budget('cat-99', 500)], monthTxns);
    expect(unused.spent).toBe(0);
    expect(unused.remaining).toBe(500);
  });
});

describe('transactionMatchesQuery', () => {
  const accounts: Account[] = [
    {
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      color: '#000',
      icon: 'landmark',
      balance: 0,
      openingBalance: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'acc-2',
      name: 'Cash Wallet',
      type: 'cash',
      color: '#000',
      icon: 'wallet',
      balance: 0,
      openingBalance: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const labels: Label[] = [
    { id: 'lbl-1', name: 'Essential', color: '#22c55e' },
    { id: 'lbl-2', name: 'Discretionary', color: '#f59e0b' },
  ];
  const index = buildSearchIndex(categories, accounts, labels);

  const groceries = tx({
    type: 'expense',
    amount: 1200.5,
    note: 'Weekly groceries',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    labels: ['lbl-1'],
  });
  const transfer = tx({
    type: 'transfer',
    amount: 500,
    accountId: 'acc-1',
    toAccountId: 'acc-2',
    note: '',
  });

  it('matches an empty query against everything', () => {
    expect(transactionMatchesQuery(groceries, '   ', index)).toBe(true);
  });

  it('matches the note case-insensitively', () => {
    expect(transactionMatchesQuery(groceries, 'GROCER', index)).toBe(true);
  });

  it('matches the category name', () => {
    expect(transactionMatchesQuery(groceries, 'food', index)).toBe(true);
  });

  it('matches the source account name', () => {
    expect(transactionMatchesQuery(groceries, 'hdfc', index)).toBe(true);
  });

  it('matches the destination account of a transfer', () => {
    expect(transactionMatchesQuery(transfer, 'cash wallet', index)).toBe(true);
  });

  it('matches a label name', () => {
    expect(transactionMatchesQuery(groceries, 'essential', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, 'discretionary', index)).toBe(false);
  });

  it('matches the amount, ignoring grouping and currency symbols', () => {
    expect(transactionMatchesQuery(groceries, '1200', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, '₹1,200', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, '1200.5', index)).toBe(true);
  });

  it('does not treat a bare separator as an amount match', () => {
    expect(transactionMatchesQuery(transfer, '.', index)).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(transactionMatchesQuery(groceries, 'zzz', index)).toBe(false);
  });
});

describe('getDashboardStats', () => {
  it('reports a negative savings rate when spending exceeds income', () => {
    const stats = getDashboardStats(
      [tx({ type: 'income', amount: 1000 }), tx({ type: 'expense', amount: 1500 })],
      [],
      categories,
    );
    expect(stats.savingsRate).toBeCloseTo(-0.5);
  });

  it('reports a zero savings rate when there is no income to divide by', () => {
    const stats = getDashboardStats([tx({ type: 'expense', amount: 500 })], [], categories);
    expect(stats.savingsRate).toBe(0);
  });

  it('picks the biggest expense and the top category', () => {
    const stats = getDashboardStats(
      [
        tx({ type: 'expense', amount: 100, categoryId: 'cat-1', id: 'a' }),
        tx({ type: 'expense', amount: 400, categoryId: 'cat-2', id: 'b' }),
        tx({ type: 'expense', amount: 250, categoryId: 'cat-1', id: 'c' }),
      ],
      [],
      categories,
    );
    expect(stats.biggestExpense?.id).toBe('b');
    expect(stats.topCategory?.category.id).toBe('cat-2');
    expect(stats.topCategory?.amount).toBe(400);
  });

  it('computes month-over-month change against the previous month', () => {
    const stats = getDashboardStats(
      [tx({ type: 'expense', amount: 1200 })],
      [tx({ type: 'expense', amount: 1000, id: 'prev' })],
      categories,
    );
    expect(stats.monthOverMonthChange).toBeCloseTo(0.2);
  });
});
