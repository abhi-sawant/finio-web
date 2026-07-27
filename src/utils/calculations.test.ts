import { describe, expect, it } from 'vitest';
import { computeBudgetStatuses, getDashboardStats } from './calculations';
import type { Budget, Category, Transaction } from '@/types';

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
