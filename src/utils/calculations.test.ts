import { describe, expect, it, vi } from 'vitest';
import {
  buildSearchIndex,
  budgetScopeKey,
  computeBudgetHistory,
  computeBudgetStatuses,
  getCurrentMonthTransactions,
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

function budget(categoryId: string, amount: number, extra: Partial<Budget> = {}): Budget {
  return {
    id: `b-${categoryId}`,
    categoryId,
    amount,
    period: 'monthly',
    rollover: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/** Local-time helpers: period boundaries are local, so fixtures must be too. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const on = (y: number, m: number, d: number) => at(y, m, d, 10).toISOString();

/** June 2026, comfortably inside the month in any timezone. */
const IN_JUNE = { now: at(2026, 6, 15) };

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
    const [food] = computeBudgetStatuses([budget('cat-1', 1000)], monthTxns, IN_JUNE);
    expect(food.spent).toBe(500);
    expect(food.remaining).toBe(500);
    expect(food.percent).toBe(50);
    expect(food.isOver).toBe(false);
  });

  it('treats an empty categoryId as the overall budget across all expenses', () => {
    const [overall] = computeBudgetStatuses([budget('', 1000)], monthTxns, IN_JUNE);
    expect(overall.spent).toBe(600);
  });

  it('flags an exceeded budget and reports negative remaining', () => {
    const [tight] = computeBudgetStatuses([budget('cat-1', 400)], monthTxns, IN_JUNE);
    expect(tight.isOver).toBe(true);
    expect(tight.remaining).toBe(-100);
    expect(tight.percent).toBe(125);
  });

  it('does not report over-budget when spending exactly matches the limit', () => {
    const [exact] = computeBudgetStatuses([budget('cat-1', 500)], monthTxns, IN_JUNE);
    expect(exact.isOver).toBe(false);
    expect(exact.percent).toBe(100);
  });

  it('reports zero percent instead of Infinity for a zero-amount budget', () => {
    const [zero] = computeBudgetStatuses([budget('cat-1', 0)], monthTxns, IN_JUNE);
    expect(zero.percent).toBe(0);
  });

  it('reports zero spend for a category with no transactions', () => {
    const [unused] = computeBudgetStatuses([budget('cat-99', 500)], monthTxns, IN_JUNE);
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

  it('paces the daily average over the cycle, not the calendar month', () => {
    const spend = [tx({ type: 'expense', amount: 1000, date: on(2026, 7, 2) })];
    // 4 Jul: four days into the calendar month, but ten into a 25th-start cycle.
    const calendar = getDashboardStats(spend, [], categories, { now: at(2026, 7, 4) });
    const cycle = getDashboardStats(spend, [], categories, {
      now: at(2026, 7, 4),
      monthStartDay: 25,
    });

    expect(calendar.dailyAverage).toBe(250);
    expect(cycle.dailyAverage).toBe(100);
  });
});

describe('budget scopes', () => {
  const inJuly = { now: at(2026, 7, 15) };

  it('keeps overall, category and label budgets in distinct scopes', () => {
    expect(budgetScopeKey({ categoryId: '' })).not.toBe(budgetScopeKey({ categoryId: 'cat-1' }));
    expect(budgetScopeKey({ categoryId: '', labelId: 'lbl-1' })).not.toBe(
      budgetScopeKey({ categoryId: '' }),
    );
    // A label budget's categoryId is irrelevant — the label is what identifies it.
    expect(budgetScopeKey({ categoryId: 'cat-1', labelId: 'lbl-1' })).toBe(
      budgetScopeKey({ categoryId: '', labelId: 'lbl-1' }),
    );
  });

  it('sums a label budget across categories', () => {
    const txns = [
      tx({ type: 'expense', amount: 300, id: 'a', date: on(2026, 7, 3), labels: ['lbl-1'] }),
      tx({
        type: 'expense',
        amount: 200,
        id: 'b',
        date: on(2026, 7, 4),
        categoryId: 'cat-2',
        labels: ['lbl-1', 'lbl-2'],
      }),
      tx({ type: 'expense', amount: 900, id: 'c', date: on(2026, 7, 5), labels: ['lbl-2'] }),
    ];

    const [status] = computeBudgetStatuses([budget('', 1000, { labelId: 'lbl-1' })], txns, inJuly);
    expect(status.spent).toBe(500);
  });

  it('counts only the current week for a weekly budget', () => {
    const txns = [
      // 13–19 Jul 2026 is the week containing the 15th.
      tx({ type: 'expense', amount: 400, id: 'in', date: on(2026, 7, 14) }),
      tx({ type: 'expense', amount: 700, id: 'out', date: on(2026, 7, 10) }),
    ];

    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { period: 'weekly' })],
      txns,
      inJuly,
    );
    expect(status.spent).toBe(400);
    expect(status.range.start).toEqual(new Date(2026, 6, 13));
  });

  it('follows the custom month start day', () => {
    const txns = [
      // 26 Jun belongs to the 25 Jun – 24 Jul cycle, not to June.
      tx({ type: 'expense', amount: 250, id: 'cycle', date: on(2026, 6, 26) }),
      tx({ type: 'expense', amount: 800, id: 'before', date: on(2026, 6, 20) }),
    ];

    const [status] = computeBudgetStatuses([budget('cat-1', 1000)], txns, {
      now: at(2026, 7, 10),
      monthStartDay: 25,
    });
    expect(status.spent).toBe(250);
    expect(status.range.start).toEqual(new Date(2026, 5, 25));
  });
});

describe('budget rollover', () => {
  const inJuly = { now: at(2026, 7, 15) };
  const juneSpend = (amount: number) => [
    tx({ type: 'expense', amount, id: 'june', date: on(2026, 6, 10) }),
  ];
  const created = new Date(2026, 5, 1).toISOString();

  it('carries unspent budget into the current period', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { rollover: true, createdAt: created })],
      juneSpend(400),
      inJuly,
    );
    expect(status.carryover).toBe(600);
    expect(status.limit).toBe(1600);
    expect(status.remaining).toBe(1600);
  });

  it('carries an overspend forward as a debt', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { rollover: true, createdAt: created })],
      juneSpend(1300),
      inJuly,
    );
    expect(status.carryover).toBe(-300);
    expect(status.limit).toBe(700);
  });

  it('starts every period fresh when rollover is off', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { createdAt: created })],
      juneSpend(400),
      inJuly,
    );
    expect(status.carryover).toBe(0);
    expect(status.limit).toBe(1000);
  });

  it('never reaches back past the period the budget was created in', () => {
    const [status] = computeBudgetStatuses(
      // Created this period, so there is nothing to roll over yet.
      [budget('cat-1', 1000, { rollover: true, createdAt: new Date(2026, 6, 2).toISOString() })],
      juneSpend(0),
      inJuly,
    );
    expect(status.carryover).toBe(0);
  });
});

describe('computeBudgetHistory', () => {
  it('reports completed periods most recent first', () => {
    const txns = [
      tx({ type: 'expense', amount: 400, id: 'may', date: on(2026, 5, 10) }),
      tx({ type: 'expense', amount: 1200, id: 'jun', date: on(2026, 6, 10) }),
      tx({ type: 'expense', amount: 50, id: 'jul', date: on(2026, 7, 10) }),
    ];

    const history = computeBudgetHistory(
      budget('cat-1', 1000, { createdAt: new Date(2026, 4, 1).toISOString() }),
      txns,
      { now: at(2026, 7, 15) },
    );

    // The in-progress period is not history.
    expect(history).toHaveLength(2);
    expect(history[0].spent).toBe(1200);
    expect(history[0].isOver).toBe(true);
    expect(history[1].spent).toBe(400);
    expect(history[1].isOver).toBe(false);
  });

  it('reflects rolled-over limits in past periods', () => {
    const txns = [tx({ type: 'expense', amount: 400, id: 'may', date: on(2026, 5, 10) })];
    const [june] = computeBudgetHistory(
      budget('cat-1', 1000, { rollover: true, createdAt: new Date(2026, 4, 1).toISOString() }),
      txns,
      { now: at(2026, 7, 15) },
    );
    // June inherited May's unspent 600.
    expect(june.limit).toBe(1600);
    expect(june.spent).toBe(0);
  });
});

describe('getCurrentMonthTransactions', () => {
  it('uses the salary cycle rather than the calendar month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 7, 10));
    try {
      const txns = [
        tx({ type: 'expense', amount: 100, id: 'cycle', date: on(2026, 6, 26) }),
        tx({ type: 'expense', amount: 100, id: 'before', date: on(2026, 6, 20) }),
      ];
      expect(getCurrentMonthTransactions(txns).map((t) => t.id)).toEqual([]);
      expect(getCurrentMonthTransactions(txns, 25).map((t) => t.id)).toEqual(['cycle']);
    } finally {
      vi.useRealTimers();
    }
  });
});
