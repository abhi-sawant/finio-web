import { describe, expect, it } from 'vitest';
import {
  buildNetWorthSeries,
  netWorthAt,
  netWorthComponents,
  planNetWorthSnapshots,
  snapshotPeriodKey,
} from './netWorth';
import type { Account, NetWorthSnapshot, Transaction } from '@/types';

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
    categoryId: 'cat-1',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

function snapshot(
  partial: Partial<NetWorthSnapshot> & Pick<NetWorthSnapshot, 'periodKey'>,
): NetWorthSnapshot {
  return {
    id: `snap-${partial.periodKey}`,
    date: `${partial.periodKey}-28T23:59:59.999Z`,
    assets: 0,
    liabilities: 0,
    createdAt: `${partial.periodKey}-28T23:59:59.999Z`,
    ...partial,
  };
}

describe('netWorthComponents', () => {
  it('splits balances into assets and liabilities, ignoring archived accounts', () => {
    expect(
      netWorthComponents([
        account({ id: 'checking', balance: 10000 }),
        account({ id: 'card', type: 'credit', balance: -2500 }),
        account({ id: 'closed', balance: 9999, archivedAt: '2026-01-01T00:00:00.000Z' }),
      ]),
    ).toEqual({ assets: 10000, liabilities: 2500, netWorth: 7500 });
  });
});

describe('snapshotPeriodKey', () => {
  it('keys on the financial month start, not the calendar month', () => {
    expect(snapshotPeriodKey(new Date('2026-07-10T00:00:00.000Z'), 1)).toBe('2026-07');
    // With a 25th cycle, 10 July still belongs to the month that opened on 25 June.
    expect(snapshotPeriodKey(new Date('2026-07-10T00:00:00.000Z'), 25)).toBe('2026-06');
  });
});

describe('netWorthAt', () => {
  const accounts = [
    account({ id: 'checking', balance: 12000 }),
    account({ id: 'card', type: 'credit', balance: -1000 }),
  ];
  const transactions = [
    tx({ type: 'income', amount: 5000, date: '2026-06-10T00:00:00.000Z' }),
    tx({ type: 'expense', amount: 1000, date: '2026-06-12T00:00:00.000Z', accountId: 'card' }),
  ];

  it('rewinds today’s balances through everything recorded since', () => {
    expect(netWorthAt(accounts, transactions, new Date('2026-06-01T00:00:00.000Z'))).toEqual({
      assets: 7000,
      liabilities: 0,
      netWorth: 7000,
    });
  });

  it('is today’s live position when nothing has happened since the cutoff', () => {
    expect(netWorthAt(accounts, transactions, NOW)).toEqual({
      assets: 12000,
      liabilities: 1000,
      netWorth: 11000,
    });
  });

  it('nets an internal transfer out, since it moves nothing overall', () => {
    const withTransfer = [
      account({ id: 'checking', balance: 8000 }),
      account({ id: 'savings', type: 'savings', balance: 2000 }),
    ];
    expect(
      netWorthAt(
        withTransfer,
        [
          tx({
            type: 'transfer',
            amount: 2000,
            date: '2026-06-10T00:00:00.000Z',
            accountId: 'checking',
            toAccountId: 'savings',
          }),
        ],
        new Date('2026-06-01T00:00:00.000Z'),
      ).netWorth,
    ).toBe(10000);
  });
});

describe('planNetWorthSnapshots', () => {
  const accounts = [account({ id: 'checking', balance: 10000 })];
  const transactions = [
    tx({ type: 'income', amount: 4000, date: '2026-04-10T00:00:00.000Z' }),
    tx({ type: 'income', amount: 3000, date: '2026-05-10T00:00:00.000Z' }),
  ];

  it('captures completed months only — never the one still running', () => {
    const planned = planNetWorthSnapshots({
      accounts,
      transactions,
      snapshots: [],
      now: NOW,
      maxBackfill: 3,
    });

    expect(planned.map((p) => p.periodKey)).toEqual(['2026-04', '2026-05']);
  });

  it('stops before the first transaction rather than inventing empty history', () => {
    const planned = planNetWorthSnapshots({
      accounts,
      transactions,
      snapshots: [],
      now: NOW,
      maxBackfill: 12,
    });

    expect(planned).toHaveLength(2);
  });

  it('skips months that already have a snapshot', () => {
    const planned = planNetWorthSnapshots({
      accounts,
      transactions,
      snapshots: [snapshot({ periodKey: '2026-05', assets: 1, liabilities: 0 })],
      now: NOW,
      maxBackfill: 3,
    });

    expect(planned.map((p) => p.periodKey)).toEqual(['2026-04']);
  });

  it('freezes what net worth was at the period end, not what it is now', () => {
    const [april] = planNetWorthSnapshots({
      accounts,
      transactions,
      snapshots: [],
      now: NOW,
      maxBackfill: 2,
    });

    // 10000 today minus the 3000 that arrived in May.
    expect(april.assets).toBe(7000);
    expect(april.liabilities).toBe(0);
  });

  it('does nothing without accounts or transactions', () => {
    expect(planNetWorthSnapshots({ accounts: [], transactions, snapshots: [], now: NOW })).toEqual(
      [],
    );
    expect(planNetWorthSnapshots({ accounts, transactions: [], snapshots: [], now: NOW })).toEqual(
      [],
    );
  });
});

describe('buildNetWorthSeries', () => {
  const accounts = [account({ id: 'checking', balance: 10000 })];
  const transactions = [tx({ type: 'income', amount: 4000, date: '2026-05-10T00:00:00.000Z' })];

  it('returns one point per month, oldest first, ending with the live one', () => {
    const series = buildNetWorthSeries({
      accounts,
      transactions,
      snapshots: [],
      now: NOW,
      months: 3,
    });

    expect(series.map((p) => p.key)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(series[2].isCurrent).toBe(true);
    expect(series[2].netWorth).toBe(10000);
    expect(series[0].netWorth).toBe(6000);
  });

  it('prefers a snapshot over reconstruction for a closed month', () => {
    const series = buildNetWorthSeries({
      accounts,
      transactions,
      snapshots: [snapshot({ periodKey: '2026-04', assets: 5500, liabilities: 500 })],
      now: NOW,
      months: 3,
    });

    expect(series[0].source).toBe('snapshot');
    expect(series[0].netWorth).toBe(5000);
    expect(series[1].source).toBe('reconstructed');
  });

  it('ignores a snapshot for the month still in progress, which has no final value yet', () => {
    const series = buildNetWorthSeries({
      accounts,
      transactions,
      snapshots: [snapshot({ periodKey: '2026-06', assets: 1, liabilities: 0 })],
      now: NOW,
      months: 1,
    });

    expect(series[0].source).toBe('reconstructed');
    expect(series[0].netWorth).toBe(10000);
  });
});
