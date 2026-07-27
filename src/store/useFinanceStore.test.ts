import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, ImportPayload, Transaction } from '@/types';

// The store creates its persist middleware at import time, so localStorage has to exist
// before the module is pulled in. A Map-backed stub keeps the suite in the node
// environment (no jsdom needed).
const backing = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => void backing.set(key, value),
  removeItem: (key: string) => void backing.delete(key),
  clear: () => backing.clear(),
  key: (index: number) => Array.from(backing.keys())[index] ?? null,
  get length() {
    return backing.size;
  },
} as Storage;

const { useFinanceStore } = await import('./useFinanceStore');

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
  partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'accountId'>,
): Transaction {
  return {
    categoryId: 'cat-1',
    date: '2026-06-01T00:00:00.000Z',
    note: '',
    labels: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

function seed(accounts: Account[], transactions: Transaction[] = []) {
  useFinanceStore.setState({ accounts, transactions });
}

beforeEach(() => {
  backing.clear();
  useFinanceStore.getState().resetToDefaults();
});

describe('addAccount / updateAccount', () => {
  it('seeds the opening balance from the balance the user entered', () => {
    useFinanceStore.getState().addAccount({
      name: 'Cash',
      type: 'cash',
      color: '#000',
      icon: 'banknote',
      balance: 5000,
    });
    const [created] = useFinanceStore.getState().accounts;
    expect(created.openingBalance).toBe(5000);
  });

  it('shifts the opening balance when the current balance is edited, keeping deltas intact', () => {
    seed(
      [account('a', 800, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' })],
    );

    // User corrects the current balance to 900.
    useFinanceStore.getState().updateAccount('a', { balance: 900 });
    const [updated] = useFinanceStore.getState().accounts;
    expect(updated.openingBalance).toBe(1100);

    // The edit must survive a reconcile — that is the whole point of moving the opening balance.
    expect(useFinanceStore.getState().recomputeBalances().changed).toBe(0);
    expect(useFinanceStore.getState().accounts[0].balance).toBe(900);
  });
});

describe('recomputeBalances', () => {
  it('repairs drifted balances and reports what it corrected', () => {
    seed(
      [account('a', 999, 1000), account('b', 500, 500)],
      [tx({ id: 't1', type: 'expense', amount: 100, accountId: 'a' })],
    );

    const result = useFinanceStore.getState().recomputeBalances();
    expect(result).toEqual({ changed: 1, totalDrift: -99 });
    expect(useFinanceStore.getState().accounts.map((a) => a.balance)).toEqual([900, 500]);
  });

  it('reports nothing to do when balances already agree', () => {
    seed(
      [account('a', 900, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 100, accountId: 'a' })],
    );
    expect(useFinanceStore.getState().recomputeBalances()).toEqual({ changed: 0, totalDrift: 0 });
  });
});

describe('deleteAccount', () => {
  it('reverses the other side of a transfer instead of leaving it inflated', () => {
    seed(
      [account('a', 700, 1000), account('b', 500, 200)],
      [tx({ id: 't1', type: 'transfer', amount: 300, accountId: 'a', toAccountId: 'b' })],
    );

    useFinanceStore.getState().deleteAccount('a');
    const remaining = useFinanceStore.getState().accounts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].balance).toBe(200);
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
    // And the survivor is still internally consistent.
    expect(useFinanceStore.getState().recomputeBalances().changed).toBe(0);
  });
});

describe('importData', () => {
  const payload: ImportPayload = {
    accounts: [account('imported', 0, 1000)],
    transactions: [tx({ id: 'it1', type: 'expense', amount: 250, accountId: 'imported' })],
  };

  it('replaces collections and recomputes balances from the imported transactions', () => {
    seed(
      [account('local', 4000)],
      [tx({ id: 'lt1', type: 'income', amount: 4000, accountId: 'local' })],
    );

    useFinanceStore.getState().importData(payload, { mode: 'replace' });
    const state = useFinanceStore.getState();

    expect(state.accounts.map((a) => a.id)).toEqual(['imported']);
    // The file's stale `balance: 0` is discarded in favour of opening + deltas.
    expect(state.accounts[0].balance).toBe(750);
    expect(state.transactions.map((t) => t.id)).toEqual(['it1']);
  });

  it('merges by id, with incoming rows winning and local rows kept', () => {
    seed(
      [account('local', 4000, 4000), account('imported', 0, 0)],
      [tx({ id: 'lt1', type: 'income', amount: 0, accountId: 'local' })],
    );

    useFinanceStore.getState().importData(payload, { mode: 'merge' });
    const state = useFinanceStore.getState();

    expect(state.accounts.map((a) => a.id).sort()).toEqual(['imported', 'local']);
    expect(state.transactions.map((t) => t.id).sort()).toEqual(['it1', 'lt1']);
    // Incoming account replaced the local stub of the same id, then got recomputed.
    expect(state.accounts.find((a) => a.id === 'imported')?.balance).toBe(750);
    expect(state.accounts.find((a) => a.id === 'local')?.balance).toBe(4000);
  });

  it('derives an opening balance for accounts imported without one', () => {
    const legacy: ImportPayload = {
      accounts: [{ ...account('legacy', 750), openingBalance: undefined }],
      transactions: [tx({ id: 'lg1', type: 'expense', amount: 250, accountId: 'legacy' })],
    };

    useFinanceStore.getState().importData(legacy, { mode: 'replace' });
    const [imported] = useFinanceStore.getState().accounts;
    expect(imported.openingBalance).toBe(1000);
    // Balance-neutral: what the backup said the balance was is what you get.
    expect(imported.balance).toBe(750);
  });

  it('leaves untouched collections alone when a key is absent', () => {
    seed([account('local', 100)]);
    const before = useFinanceStore.getState().categories;
    useFinanceStore.getState().importData({ transactions: [] }, { mode: 'replace' });
    expect(useFinanceStore.getState().categories).toBe(before);
    expect(useFinanceStore.getState().accounts.map((a) => a.id)).toEqual(['local']);
  });
});

describe('v5 migration', () => {
  it('backfills opening balances from persisted v4 state without moving any balance', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 4,
        state: {
          accounts: [
            { ...account('a', 750), openingBalance: undefined, currency: 'INR' },
            { ...account('b', 1200), openingBalance: undefined },
          ],
          transactions: [
            tx({ id: 't1', type: 'expense', amount: 250, accountId: 'a' }),
            tx({ id: 't2', type: 'transfer', amount: 200, accountId: 'a', toAccountId: 'b' }),
          ],
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const accounts = useFinanceStore.getState().accounts;

    expect(accounts.map((a) => a.balance)).toEqual([750, 1200]);
    expect(accounts.map((a) => a.openingBalance)).toEqual([1200, 1000]);
    // Reconciling straight after a migration must be a no-op.
    expect(useFinanceStore.getState().recomputeBalances().changed).toBe(0);
  });
});
