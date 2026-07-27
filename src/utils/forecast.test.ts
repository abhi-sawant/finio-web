import { describe, expect, it } from 'vitest';
import { buildCashFlowForecast, categoryDailyAverages, liquidDelta } from './forecast';
import type { Account, RecurringTransaction, Transaction } from '@/types';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function account(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: partial.id,
    type: 'checking',
    color: '#000',
    icon: 'landmark',
    balance: 0,
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>,
): Transaction {
  return {
    id: partial.id ?? `${partial.type}-${partial.amount}-${partial.date}`,
    accountId: 'checking',
    categoryId: 'cat-food',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

function rule(
  partial: Partial<RecurringTransaction> & Pick<RecurringTransaction, 'id' | 'amount'>,
): RecurringTransaction {
  return {
    type: 'expense',
    accountId: 'checking',
    categoryId: 'cat-bills',
    note: 'Rent',
    labels: [],
    frequency: 'monthly',
    startDate: '2026-06-20T00:00:00.000Z',
    occurrenceCount: 0,
    lastRunDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const ACCOUNTS = [
  account({ id: 'checking', balance: 10000 }),
  account({ id: 'card', type: 'credit', balance: -3000, creditLimit: 50000 }),
  account({ id: 'closed', balance: 999, archivedAt: '2026-02-01T00:00:00.000Z' }),
];

describe('liquidDelta', () => {
  const liquid = new Set(['checking', 'savings']);

  it('moves cash only when a liquid account is on the paying side', () => {
    expect(liquidDelta({ type: 'expense', amount: 100, accountId: 'checking' }, liquid)).toBe(-100);
    expect(liquidDelta({ type: 'income', amount: 100, accountId: 'checking' }, liquid)).toBe(100);
    // Card spending is a liability, not cash out — it lands when the card is paid.
    expect(liquidDelta({ type: 'expense', amount: 100, accountId: 'card' }, liquid)).toBe(0);
  });

  it('nets an internal transfer to zero and counts one that crosses the boundary', () => {
    expect(
      liquidDelta(
        { type: 'transfer', amount: 500, accountId: 'checking', toAccountId: 'savings' },
        liquid,
      ),
    ).toBe(0);
    // Paying the card off does take cash out.
    expect(
      liquidDelta(
        { type: 'transfer', amount: 500, accountId: 'checking', toAccountId: 'card' },
        liquid,
      ),
    ).toBe(-500);
    expect(
      liquidDelta(
        { type: 'transfer', amount: 500, accountId: 'card', toAccountId: 'checking' },
        liquid,
      ),
    ).toBe(500);
  });
});

describe('categoryDailyAverages', () => {
  it('divides by the history that exists, not by the whole lookback window', () => {
    const { dailyEstimate, lookbackDays } = categoryDailyAverages(
      [
        tx({ type: 'expense', amount: 100, date: '2026-06-14T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 100, date: '2026-06-15T00:00:00.000Z' }),
      ],
      ACCOUNTS,
      { now: NOW, lookbackDays: 90 },
    );

    expect(lookbackDays).toBe(2);
    expect(dailyEstimate).toBe(100);
  });

  it('leaves out recurring-generated rows, so subscriptions are not billed twice', () => {
    const { dailyEstimate } = categoryDailyAverages(
      [
        tx({ type: 'expense', amount: 100, date: '2026-06-15T00:00:00.000Z' }),
        tx({
          type: 'expense',
          amount: 5000,
          date: '2026-06-15T00:00:00.000Z',
          recurringId: 'rule-rent',
        }),
      ],
      ACCOUNTS,
      { now: NOW },
    );

    expect(dailyEstimate).toBe(100);
  });

  it('ignores spending on credit and archived accounts', () => {
    const { dailyEstimate } = categoryDailyAverages(
      [
        tx({ type: 'expense', amount: 700, date: '2026-06-15T00:00:00.000Z', accountId: 'card' }),
        tx({ type: 'expense', amount: 700, date: '2026-06-15T00:00:00.000Z', accountId: 'closed' }),
      ],
      ACCOUNTS,
      { now: NOW },
    );

    expect(dailyEstimate).toBe(0);
  });

  it('splits a split expense across its own categories', () => {
    const { averages } = categoryDailyAverages(
      [
        tx({
          type: 'expense',
          amount: 300,
          date: '2026-06-15T00:00:00.000Z',
          categoryId: '',
          splits: [
            { categoryId: 'cat-food', amount: 200 },
            { categoryId: 'cat-home', amount: 100 },
          ],
        }),
      ],
      ACCOUNTS,
      { now: NOW },
    );

    expect(averages).toEqual([
      { categoryId: 'cat-food', dailyAverage: 200, monthlyAverage: 6000, share: 200 / 300 },
      { categoryId: 'cat-home', dailyAverage: 100, monthlyAverage: 3000, share: 100 / 300 },
    ]);
  });
});

describe('buildCashFlowForecast', () => {
  it('starts at the liquid balance, excluding credit and archived accounts', () => {
    const forecast = buildCashFlowForecast({
      accounts: ACCOUNTS,
      transactions: [],
      recurring: [],
      now: NOW,
      days: 30,
    });

    expect(forecast.startBalance).toBe(10000);
    expect(forecast.points[0].balance).toBe(10000);
    expect(forecast.points).toHaveLength(31);
  });

  it('draws the balance down by the daily estimate and by scheduled bills', () => {
    const forecast = buildCashFlowForecast({
      accounts: [account({ id: 'checking', balance: 10000 })],
      transactions: [tx({ type: 'expense', amount: 100, date: '2026-06-15T00:00:00.000Z' })],
      recurring: [rule({ id: 'rule-rent', amount: 2000 })],
      now: NOW,
      days: 30,
    });

    expect(forecast.dailyEstimate).toBe(100);
    // One rent occurrence lands inside the window.
    expect(forecast.scheduled).toHaveLength(1);
    expect(forecast.totals.scheduledOut).toBe(2000);
    expect(forecast.totals.estimatedOut).toBe(3000);
    expect(forecast.endBalance).toBe(10000 - 2000 - 3000);
  });

  it('counts an income rule as money in', () => {
    const forecast = buildCashFlowForecast({
      accounts: [account({ id: 'checking', balance: 0 })],
      transactions: [],
      recurring: [rule({ id: 'rule-salary', amount: 50000, type: 'income', note: 'Salary' })],
      now: NOW,
      days: 30,
    });

    expect(forecast.totals.scheduledIn).toBe(50000);
    expect(forecast.endBalance).toBe(50000);
  });

  it('leaves out a paused rule — a forecast must not assume it resumes', () => {
    const forecast = buildCashFlowForecast({
      accounts: [account({ id: 'checking', balance: 10000 })],
      transactions: [],
      recurring: [rule({ id: 'rule-rent', amount: 2000, pausedAt: '2026-06-01T00:00:00.000Z' })],
      now: NOW,
      days: 60,
    });

    expect(forecast.scheduled).toHaveLength(0);
  });

  it('drops rules that cannot move liquid cash', () => {
    const forecast = buildCashFlowForecast({
      accounts: ACCOUNTS,
      transactions: [],
      recurring: [rule({ id: 'rule-card', amount: 900, accountId: 'card', note: 'Netflix' })],
      now: NOW,
      days: 60,
    });

    expect(forecast.scheduled).toHaveLength(0);
  });

  it('reports the low point and the day the balance runs out', () => {
    const forecast = buildCashFlowForecast({
      accounts: [account({ id: 'checking', balance: 1000 })],
      transactions: [tx({ type: 'expense', amount: 100, date: '2026-06-15T00:00:00.000Z' })],
      recurring: [],
      now: NOW,
      days: 30,
    });

    // 100/day against 1000 → negative from the 11th day onward.
    expect(forecast.shortfallDate?.toDateString()).toBe(
      new Date('2026-06-26T00:00:00.000Z').toDateString(),
    );
    expect(forecast.low?.balance).toBe(-2000);
    expect(forecast.endBalance).toBe(-2000);
  });

  it('is empty when there is nothing to project from', () => {
    expect(
      buildCashFlowForecast({ accounts: [], transactions: [], recurring: [], now: NOW }).isEmpty,
    ).toBe(true);
    expect(
      buildCashFlowForecast({
        accounts: [account({ id: 'checking', balance: 500 })],
        transactions: [],
        recurring: [],
        now: NOW,
      }).isEmpty,
    ).toBe(true);
  });
});
