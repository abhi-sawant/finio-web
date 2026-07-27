import { describe, expect, it } from 'vitest';
import {
  applyBalanceDelta,
  backfillOpeningBalances,
  diffBalances,
  recomputeAccountBalances,
  sumTransactionDeltas,
} from './balance';
import type { Account, Transaction } from '@/types';

function account(id: string, balance: number, openingBalance = balance): Account {
  return {
    id,
    name: id,
    type: 'checking',
    color: '#000',
    icon: 'landmark',
    balance,
    openingBalance,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId'>,
): Transaction {
  return {
    id: partial.id ?? `tx-${partial.accountId}-${partial.amount}-${partial.type}`,
    categoryId: 'cat-1',
    date: '2026-06-01T00:00:00.000Z',
    note: '',
    labels: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('applyBalanceDelta', () => {
  it('subtracts an expense and adds it back on reverse', () => {
    const accounts = [account('a', 1000)];
    const expense = tx({ type: 'expense', amount: 250, accountId: 'a' });

    const applied = applyBalanceDelta(accounts, expense, 1);
    expect(applied[0].balance).toBe(750);
    expect(applyBalanceDelta(applied, expense, -1)[0].balance).toBe(1000);
  });

  it('adds income to the target account only', () => {
    const accounts = [account('a', 100), account('b', 500)];
    const applied = applyBalanceDelta(
      accounts,
      tx({ type: 'income', amount: 400, accountId: 'a' }),
      1,
    );
    expect(applied.map((a) => a.balance)).toEqual([500, 500]);
  });

  it('moves both sides of a transfer atomically', () => {
    const accounts = [account('a', 1000), account('b', 200)];
    const transfer = tx({ type: 'transfer', amount: 300, accountId: 'a', toAccountId: 'b' });

    const applied = applyBalanceDelta(accounts, transfer, 1);
    expect(applied.map((a) => a.balance)).toEqual([700, 500]);
    expect(applyBalanceDelta(applied, transfer, -1).map((a) => a.balance)).toEqual([1000, 200]);
  });

  it('ignores a transfer with no destination for the credited side', () => {
    const accounts = [account('a', 1000), account('b', 200)];
    const applied = applyBalanceDelta(
      accounts,
      tx({ type: 'transfer', amount: 100, accountId: 'a' }),
      1,
    );
    expect(applied.map((a) => a.balance)).toEqual([900, 200]);
  });

  it('rounds to paise so repeated deltas do not drift', () => {
    let accounts = [account('a', 0)];
    for (let i = 0; i < 3; i += 1) {
      accounts = applyBalanceDelta(
        accounts,
        tx({ type: 'income', amount: 0.1, accountId: 'a' }),
        1,
      );
    }
    expect(accounts[0].balance).toBe(0.3);
  });
});

describe('sumTransactionDeltas', () => {
  it('nets expenses, income and both transfer legs per account', () => {
    const deltas = sumTransactionDeltas([
      tx({ type: 'income', amount: 1000, accountId: 'a' }),
      tx({ type: 'expense', amount: 250, accountId: 'a' }),
      tx({ type: 'transfer', amount: 100, accountId: 'a', toAccountId: 'b' }),
    ]);
    expect(deltas.get('a')).toBe(650);
    expect(deltas.get('b')).toBe(100);
  });

  it('skips rows with a non-finite amount instead of poisoning the total with NaN', () => {
    const deltas = sumTransactionDeltas([
      tx({ type: 'income', amount: 100, accountId: 'a' }),
      tx({ type: 'expense', amount: Number.NaN, accountId: 'a' }),
    ]);
    expect(deltas.get('a')).toBe(100);
  });
});

describe('backfillOpeningBalances', () => {
  it('derives the opening balance from the stored balance minus its transactions', () => {
    const legacy = [{ ...account('a', 750), openingBalance: undefined }];
    const transactions = [tx({ type: 'expense', amount: 250, accountId: 'a' })];

    const [migrated] = backfillOpeningBalances(legacy, transactions);
    expect(migrated.openingBalance).toBe(1000);
    // The migration must be balance-neutral.
    expect(migrated.balance).toBe(750);
    expect(recomputeAccountBalances([migrated], transactions)[0].balance).toBe(750);
  });

  it('leaves an existing opening balance untouched', () => {
    const [kept] = backfillOpeningBalances(
      [account('a', 750, 1000)],
      [tx({ type: 'expense', amount: 999, accountId: 'a' })],
    );
    expect(kept.openingBalance).toBe(1000);
  });
});

describe('recomputeAccountBalances', () => {
  it('repairs drift left behind by a bad delete or partial import', () => {
    // 'b' was inflated by a transfer whose transaction no longer exists.
    const accounts = [account('a', 1000, 1000), account('b', 800, 500)];
    const [a, b] = recomputeAccountBalances(accounts, [
      tx({ type: 'expense', amount: 100, accountId: 'a' }),
    ]);
    expect(a.balance).toBe(900);
    expect(b.balance).toBe(500);
  });

  it('is a no-op when balances already agree with the transactions', () => {
    const accounts = [account('a', 900, 1000)];
    const transactions = [tx({ type: 'expense', amount: 100, accountId: 'a' })];
    const recomputed = recomputeAccountBalances(accounts, transactions);
    expect(recomputed[0]).toBe(accounts[0]);
    expect(diffBalances(accounts, recomputed).changed).toBe(0);
  });

  it('ignores transactions pointing at accounts that no longer exist', () => {
    const [a] = recomputeAccountBalances(
      [account('a', 1000, 1000)],
      [tx({ type: 'expense', amount: 50, accountId: 'ghost' })],
    );
    expect(a.balance).toBe(1000);
  });
});

describe('diffBalances', () => {
  it('reports how many accounts moved and the net correction', () => {
    const before = [account('a', 800), account('b', 500)];
    const after = [account('a', 900), account('b', 450)];
    expect(diffBalances(before, after)).toEqual({ changed: 2, totalDrift: 50 });
  });
});
