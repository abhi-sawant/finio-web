import { describe, expect, it } from 'vitest';
import {
  buildPeriodComparison,
  buildSpendingCalendar,
  buildYearInReview,
  categoryMovements,
  summarizePeriod,
} from './analytics';
import { periodRange } from './period';
import type { Account, Transaction } from '@/types';

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>,
): Transaction {
  return {
    id: partial.id ?? `${partial.type}-${partial.amount}-${partial.date}`,
    accountId: 'acc-1',
    categoryId: 'cat-food',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

const JUNE = new Date('2026-06-15T12:00:00.000Z');

describe('summarizePeriod', () => {
  const range = periodRange('monthly', JUNE);

  it('totals income, expenses and net over the window only', () => {
    const summary = summarizePeriod(
      [
        tx({ type: 'income', amount: 5000, date: '2026-06-01T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 1200, date: '2026-06-10T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 999, date: '2026-05-30T00:00:00.000Z' }),
      ],
      range,
      { now: JUNE },
    );

    expect(summary.income).toBe(5000);
    expect(summary.expenses).toBe(1200);
    expect(summary.net).toBe(3800);
    expect(summary.transactionCount).toBe(2);
  });

  it('counts each side of a split expense against its own category', () => {
    const summary = summarizePeriod(
      [
        tx({
          type: 'expense',
          amount: 500,
          date: '2026-06-05T00:00:00.000Z',
          categoryId: '',
          splits: [
            { categoryId: 'cat-food', amount: 300 },
            { categoryId: 'cat-home', amount: 200 },
          ],
        }),
      ],
      range,
      { now: JUNE },
    );

    expect(summary.categoryTotals).toEqual([
      { categoryId: 'cat-food', amount: 300 },
      { categoryId: 'cat-home', amount: 200 },
    ]);
  });

  it('paces a partial period up to a full one, and leaves a finished period alone', () => {
    const rows = [tx({ type: 'expense', amount: 1500, date: '2026-06-01T00:00:00.000Z' })];

    // 15 of June's 30 days elapsed → double the spend so far.
    const partial = summarizePeriod(rows, range, { now: JUNE });
    expect(partial.isPartial).toBe(true);
    expect(partial.projectedExpenses).toBe(3000);

    const finished = summarizePeriod(rows, range, { now: new Date('2026-08-01T00:00:00.000Z') });
    expect(finished.isPartial).toBe(false);
    expect(finished.projectedExpenses).toBe(1500);
  });
});

describe('buildPeriodComparison', () => {
  const rows = [
    tx({ type: 'expense', amount: 1000, date: '2026-06-05T00:00:00.000Z' }),
    tx({ type: 'expense', amount: 800, date: '2026-05-05T00:00:00.000Z' }),
    tx({ type: 'expense', amount: 600, date: '2025-06-05T00:00:00.000Z' }),
  ];

  it('lines up this period, the previous one, and the same one a year back', () => {
    const comparison = buildPeriodComparison(rows, { now: JUNE });

    expect(comparison.current.expenses).toBe(1000);
    expect(comparison.previous.expenses).toBe(800);
    expect(comparison.lastYear?.expenses).toBe(600);
  });

  it('has no year-ago column for a yearly comparison, where it would repeat "previous"', () => {
    expect(buildPeriodComparison(rows, { now: JUNE, type: 'yearly' }).lastYear).toBeNull();
  });

  it('follows the financial month start day', () => {
    const salaryCycle = buildPeriodComparison(
      [tx({ type: 'expense', amount: 700, date: '2026-06-20T00:00:00.000Z' })],
      { now: new Date('2026-07-10T12:00:00.000Z'), monthStartDay: 25 },
    );

    // 25 Jun – 24 Jul is the current cycle on the 10th of July, so a 20 June expense is prior.
    expect(salaryCycle.current.expenses).toBe(0);
    expect(salaryCycle.previous.expenses).toBe(700);
  });
});

describe('categoryMovements', () => {
  it('ranks by absolute swing and treats a new category as a move from zero', () => {
    const range = periodRange('monthly', JUNE);
    const current = summarizePeriod(
      [
        tx({ type: 'expense', amount: 1000, date: '2026-06-05T00:00:00.000Z', categoryId: 'food' }),
        tx({ type: 'expense', amount: 300, date: '2026-06-06T00:00:00.000Z', categoryId: 'new' }),
      ],
      range,
      { now: JUNE },
    );
    const previous = summarizePeriod(
      [tx({ type: 'expense', amount: 400, date: '2026-05-05T00:00:00.000Z', categoryId: 'food' })],
      periodRange('monthly', new Date('2026-05-15T12:00:00.000Z')),
      { now: JUNE },
    );

    const movers = categoryMovements(current, previous);
    expect(movers.map((m) => m.categoryId)).toEqual(['food', 'new']);
    expect(movers[0].change).toBe(600);
    expect(movers[0].percentChange).toBeCloseTo(1.5);
    // Nothing to divide by when the category didn't exist last period.
    expect(movers[1].percentChange).toBeNull();
  });
});

describe('buildSpendingCalendar', () => {
  const range = periodRange('monthly', JUNE);

  it('squares every row off to a full week and flags the padding', () => {
    const calendar = buildSpendingCalendar([], range, JUNE);

    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    // 1 June 2026 is a Monday, so the first row needs no leading padding.
    expect(calendar.weeks[0][0].inRange).toBe(true);
    expect(calendar.weeks.flat().filter((d) => !d.inRange).length).toBeGreaterThan(0);
  });

  it('buckets expenses by day and scales intensity against the heaviest one', () => {
    const calendar = buildSpendingCalendar(
      [
        tx({ type: 'expense', amount: 100, date: '2026-06-02T09:00:00.000Z' }),
        tx({ type: 'expense', amount: 300, date: '2026-06-02T18:00:00.000Z' }),
        tx({ type: 'expense', amount: 50, date: '2026-06-03T10:00:00.000Z' }),
        tx({ type: 'income', amount: 9000, date: '2026-06-03T10:00:00.000Z' }),
      ],
      range,
      JUNE,
    );

    const days = calendar.weeks.flat();
    const second = days.find((d) => d.key === '2026-06-02');
    const third = days.find((d) => d.key === '2026-06-03');

    expect(second?.total).toBe(400);
    expect(second?.transactionCount).toBe(2);
    // Income is not spending.
    expect(third?.total).toBe(50);
    expect(second?.intensity).toBe(1);
    expect(third?.intensity).toBeGreaterThan(0);
    expect(third?.intensity).toBeLessThan(1);

    expect(calendar.total).toBe(450);
    expect(calendar.max).toBe(400);
    expect(calendar.daysWithSpend).toBe(2);
    expect(calendar.averagePerActiveDay).toBe(225);
    expect(calendar.busiest?.key).toBe('2026-06-02');
  });

  it('marks days after today as future', () => {
    const calendar = buildSpendingCalendar([], range, JUNE);
    const days = calendar.weeks.flat();

    expect(days.find((d) => d.key === '2026-06-14')?.isFuture).toBe(false);
    expect(days.find((d) => d.key === '2026-06-15')?.isToday).toBe(true);
    expect(days.find((d) => d.key === '2026-06-16')?.isFuture).toBe(true);
  });
});

describe('buildYearInReview', () => {
  const account: Account = {
    id: 'acc-1',
    name: 'Checking',
    type: 'checking',
    color: '#000',
    icon: 'landmark',
    balance: 5000,
    openingBalance: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
  };

  it('summarizes the financial year, its top categories and its busiest month', () => {
    const review = buildYearInReview({
      transactions: [
        tx({ type: 'income', amount: 10000, date: '2026-01-10T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 3000, date: '2026-01-10T00:00:00.000Z', categoryId: 'food' }),
        tx({ type: 'expense', amount: 500, date: '2026-03-05T00:00:00.000Z', categoryId: 'fun' }),
        // Outside the year — must not leak into any total.
        tx({ type: 'expense', amount: 9999, date: '2025-01-10T00:00:00.000Z', categoryId: 'food' }),
      ],
      accounts: [account],
      now: JUNE,
    });

    expect(review.current.income).toBe(10000);
    expect(review.current.expenses).toBe(3500);
    expect(review.topCategories[0]).toEqual({ categoryId: 'food', amount: 3000 });
    expect(review.busiestMonth?.label).toBe('Jan');
    expect(review.biggestExpense?.amount).toBe(3000);
    expect(review.monthlyBreakdown).toHaveLength(12);
  });

  it('has no busiest month, and no biggest expense, for a year with no spending', () => {
    const review = buildYearInReview({ transactions: [], accounts: [account], now: JUNE });

    expect(review.busiestMonth).toBeNull();
    expect(review.biggestExpense).toBeNull();
  });

  it('walks back a year at a time via yearOffset', () => {
    const rows = [
      tx({ type: 'expense', amount: 1000, date: '2026-02-01T00:00:00.000Z' }),
      tx({ type: 'expense', amount: 400, date: '2025-02-01T00:00:00.000Z' }),
    ];

    const thisYear = buildYearInReview({ transactions: rows, accounts: [account], now: JUNE });
    const lastYear = buildYearInReview({
      transactions: rows,
      accounts: [account],
      now: JUNE,
      yearOffset: -1,
    });

    expect(thisYear.current.expenses).toBe(1000);
    expect(lastYear.current.expenses).toBe(400);
    // Last year's "previous" column lands one year further back still, with nothing in it.
    expect(lastYear.previous.expenses).toBe(0);
  });

  it('reconstructs net worth at the edges of the year from today\'s accounts and ledger', () => {
    const review = buildYearInReview({
      transactions: [
        // Starting balance is 5000 today; this income happened mid-year, so net worth was
        // lower before it and is the full 5000 by the end of the (still in progress) year.
        tx({ type: 'income', amount: 2000, date: '2026-03-01T00:00:00.000Z' }),
      ],
      accounts: [account],
      now: JUNE,
    });

    expect(review.netWorthEnd).toBe(5000);
    expect(review.netWorthStart).toBe(3000);
    expect(review.netWorthChange).toBe(2000);
  });
});
