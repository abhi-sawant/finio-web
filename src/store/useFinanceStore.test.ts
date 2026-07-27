import { beforeEach, describe, expect, it } from 'vitest';
import { getNetWorth, getTotalAccountBalance } from '@/utils/calculations';
import { defaultSettings } from '@/data/defaultData';
import type { Account, ImportPayload, RecurringTransaction, Transaction } from '@/types';

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
  // resetToDefaults deliberately leaves settings alone, so clear them here for isolation.
  useFinanceStore.setState({ settings: defaultSettings });
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

describe('setAccountArchived', () => {
  it('closes an account without touching its transactions or balance', () => {
    seed(
      [account('a', 800, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' })],
    );

    useFinanceStore.getState().setAccountArchived('a', true);

    const state = useFinanceStore.getState();
    expect(state.accounts[0].archivedAt).toEqual(expect.any(String));
    expect(state.accounts[0].balance).toBe(800);
    expect(state.transactions).toHaveLength(1);
  });

  it('drops the flag entirely when reopening, rather than leaving a falsy value behind', () => {
    seed([account('a', 100)]);
    useFinanceStore.getState().setAccountArchived('a', true);
    useFinanceStore.getState().setAccountArchived('a', false);

    expect('archivedAt' in useFinanceStore.getState().accounts[0]).toBe(false);
  });

  it('excludes archived accounts from running totals but keeps them in the list', () => {
    seed([account('a', 1000), account('b', 500)]);
    useFinanceStore.getState().setAccountArchived('b', true);

    const { accounts } = useFinanceStore.getState();
    expect(accounts).toHaveLength(2);
    expect(getTotalAccountBalance(accounts)).toBe(1000);
    expect(getNetWorth(accounts)).toBe(1000);
  });
});

describe('deleteTransaction / restoreTransaction', () => {
  it('returns the removed row and reverses its balance delta', () => {
    seed(
      [account('a', 800, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' })],
    );

    const removed = useFinanceStore.getState().deleteTransaction('t1');

    expect(removed?.id).toBe('t1');
    expect(useFinanceStore.getState().accounts[0].balance).toBe(1000);
  });

  it('returns null for an unknown id', () => {
    seed([account('a', 100)]);
    expect(useFinanceStore.getState().deleteTransaction('nope')).toBeNull();
  });

  it('restores the row under its original id and re-applies the delta', () => {
    seed(
      [account('a', 800, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' })],
    );

    const removed = useFinanceStore.getState().deleteTransaction('t1')!;
    useFinanceStore.getState().restoreTransaction(removed);

    const state = useFinanceStore.getState();
    expect(state.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(state.accounts[0].balance).toBe(800);
  });

  it('ignores a repeated restore instead of double-counting the delta', () => {
    seed(
      [account('a', 800, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' })],
    );

    const removed = useFinanceStore.getState().deleteTransaction('t1')!;
    useFinanceStore.getState().restoreTransaction(removed);
    useFinanceStore.getState().restoreTransaction(removed);

    const state = useFinanceStore.getState();
    expect(state.transactions).toHaveLength(1);
    expect(state.accounts[0].balance).toBe(800);
  });

  it('reverses both sides of a transfer and puts them back on restore', () => {
    seed(
      [account('a', 700, 1000), account('b', 800, 500)],
      [tx({ id: 't1', type: 'transfer', amount: 300, accountId: 'a', toAccountId: 'b' })],
    );

    const removed = useFinanceStore.getState().deleteTransaction('t1')!;
    let accounts = useFinanceStore.getState().accounts;
    expect(accounts.find((a) => a.id === 'a')!.balance).toBe(1000);
    expect(accounts.find((a) => a.id === 'b')!.balance).toBe(500);

    useFinanceStore.getState().restoreTransaction(removed);
    accounts = useFinanceStore.getState().accounts;
    expect(accounts.find((a) => a.id === 'a')!.balance).toBe(700);
    expect(accounts.find((a) => a.id === 'b')!.balance).toBe(800);
  });
});

describe('bulkDeleteTransactions / restoreTransactions', () => {
  it('removes every listed transaction and reverses their deltas', () => {
    seed(
      [account('a', 500, 1000)],
      [
        tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' }),
        tx({ id: 't2', type: 'expense', amount: 300, accountId: 'a' }),
        tx({ id: 't3', type: 'expense', amount: 50, accountId: 'a' }),
      ],
    );

    const removed = useFinanceStore.getState().bulkDeleteTransactions(['t1', 't2']);

    expect(removed.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    const state = useFinanceStore.getState();
    expect(state.transactions.map((t) => t.id)).toEqual(['t3']);
    // Reversing both removed expenses (200 + 300) off the current balance of 500.
    expect(state.accounts[0].balance).toBe(1000);
  });

  it('returns an empty array and changes nothing for unknown ids', () => {
    seed([account('a', 100)]);
    expect(useFinanceStore.getState().bulkDeleteTransactions(['nope'])).toEqual([]);
    expect(useFinanceStore.getState().accounts[0].balance).toBe(100);
  });

  it('restores every row under its original id and re-applies deltas, guarding a repeat', () => {
    seed(
      [account('a', 500, 1000)],
      [
        tx({ id: 't1', type: 'expense', amount: 200, accountId: 'a' }),
        tx({ id: 't2', type: 'expense', amount: 300, accountId: 'a' }),
      ],
    );

    const removed = useFinanceStore.getState().bulkDeleteTransactions(['t1', 't2']);
    useFinanceStore.getState().restoreTransactions(removed);
    useFinanceStore.getState().restoreTransactions(removed);

    const state = useFinanceStore.getState();
    expect(state.transactions.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect(state.accounts[0].balance).toBe(500);
  });
});

describe('bulkRecategorize / bulkAddLabel', () => {
  it('reassigns the category of every listed transaction, leaving others untouched', () => {
    seed(
      [account('a', 100)],
      [
        tx({ id: 't1', type: 'expense', amount: 10, accountId: 'a', categoryId: 'cat-1' }),
        tx({ id: 't2', type: 'expense', amount: 10, accountId: 'a', categoryId: 'cat-1' }),
        tx({ id: 't3', type: 'expense', amount: 10, accountId: 'a', categoryId: 'cat-1' }),
      ],
    );

    useFinanceStore.getState().bulkRecategorize(['t1', 't2'], 'cat-2');

    const byId = new Map(useFinanceStore.getState().transactions.map((t) => [t.id, t]));
    expect(byId.get('t1')?.categoryId).toBe('cat-2');
    expect(byId.get('t2')?.categoryId).toBe('cat-2');
    expect(byId.get('t3')?.categoryId).toBe('cat-1');
  });

  it('adds a label without duplicating it on a transaction that already carries it', () => {
    seed(
      [account('a', 100)],
      [
        tx({ id: 't1', type: 'expense', amount: 10, accountId: 'a', labels: [] }),
        tx({ id: 't2', type: 'expense', amount: 10, accountId: 'a', labels: ['lbl-1'] }),
      ],
    );

    useFinanceStore.getState().bulkAddLabel(['t1', 't2'], 'lbl-1');

    const byId = new Map(useFinanceStore.getState().transactions.map((t) => [t.id, t]));
    expect(byId.get('t1')?.labels).toEqual(['lbl-1']);
    expect(byId.get('t2')?.labels).toEqual(['lbl-1']);
  });
});

describe('addTemplate / deleteTemplate', () => {
  it('saves a template and returns its id', () => {
    const id = useFinanceStore.getState().addTemplate({
      name: 'Coffee',
      type: 'expense',
      amount: 150,
      accountId: 'a',
      categoryId: 'cat-1',
      note: 'Morning coffee',
      labels: [],
    });

    const [created] = useFinanceStore.getState().templates;
    expect(created.id).toBe(id);
    expect(created.name).toBe('Coffee');
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('removes a template by id', () => {
    const id = useFinanceStore.getState().addTemplate({
      name: 'Coffee',
      type: 'expense',
      amount: 150,
      accountId: 'a',
      categoryId: 'cat-1',
      note: '',
      labels: [],
    });

    useFinanceStore.getState().deleteTemplate(id);
    expect(useFinanceStore.getState().templates).toEqual([]);
  });

  it('is cleared by resetToDefaults, same as every other finance collection', () => {
    useFinanceStore.getState().addTemplate({
      name: 'Coffee',
      type: 'expense',
      amount: 150,
      accountId: 'a',
      categoryId: 'cat-1',
      note: '',
      labels: [],
    });

    useFinanceStore.getState().resetToDefaults();
    expect(useFinanceStore.getState().templates).toEqual([]);
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

describe('addBudget', () => {
  const base = { amount: 1000, period: 'monthly' as const, rollover: false };

  it('replaces an existing budget for the same scope', () => {
    useFinanceStore.getState().addBudget({ ...base, categoryId: 'cat-1' });
    useFinanceStore.getState().addBudget({ ...base, categoryId: 'cat-1', amount: 2000 });

    const { budgets } = useFinanceStore.getState();
    expect(budgets).toHaveLength(1);
    expect(budgets[0].amount).toBe(2000);
  });

  it('keeps overall, category and label budgets side by side', () => {
    useFinanceStore.getState().addBudget({ ...base, categoryId: '' });
    useFinanceStore.getState().addBudget({ ...base, categoryId: 'cat-1' });
    useFinanceStore.getState().addBudget({ ...base, categoryId: '', labelId: 'lbl-1' });

    expect(useFinanceStore.getState().budgets).toHaveLength(3);
  });
});

describe('recurring rules', () => {
  function recurringRule(partial: Partial<RecurringTransaction> = {}): RecurringTransaction {
    return {
      id: 'r1',
      type: 'expense',
      amount: 300,
      accountId: 'a',
      categoryId: 'cat-1',
      note: '',
      labels: [],
      frequency: 'monthly',
      // Long past, but capped at a single occurrence so the test is date-independent.
      startDate: '2020-01-01T00:00:00.000Z',
      maxOccurrences: 1,
      occurrenceCount: 0,
      lastRunDate: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      ...partial,
    };
  }

  it('generates a transfer occurrence and moves both balances', () => {
    seed([account('a', 1000), account('b', 500)]);
    useFinanceStore.setState({
      recurring: [recurringRule({ type: 'transfer', toAccountId: 'b' })],
    });

    expect(useFinanceStore.getState().processRecurring()).toBe(1);

    const state = useFinanceStore.getState();
    expect(state.transactions[0].toAccountId).toBe('b');
    expect(state.accounts.find((a) => a.id === 'a')?.balance).toBe(700);
    expect(state.accounts.find((a) => a.id === 'b')?.balance).toBe(800);
    expect(state.recurring[0].occurrenceCount).toBe(1);
    // And the rule is spent — a second pass adds nothing.
    expect(useFinanceStore.getState().processRecurring()).toBe(0);
  });

  it('skips a transfer rule whose destination account is gone', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({
      recurring: [recurringRule({ type: 'transfer', toAccountId: 'missing' })],
    });

    expect(useFinanceStore.getState().processRecurring()).toBe(0);
    expect(useFinanceStore.getState().accounts[0].balance).toBe(1000);
  });

  it('generates nothing while paused and resumes cleanly', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({ recurring: [recurringRule()] });

    useFinanceStore.getState().setRecurringPaused('r1', true);
    expect(useFinanceStore.getState().processRecurring()).toBe(0);

    useFinanceStore.getState().setRecurringPaused('r1', false);
    expect('pausedAt' in useFinanceStore.getState().recurring[0]).toBe(false);
    expect(useFinanceStore.getState().processRecurring()).toBe(1);
  });

  it('drops transfer rules that pointed at a deleted account', () => {
    seed([account('a', 1000), account('b', 500)]);
    useFinanceStore.setState({
      recurring: [recurringRule({ type: 'transfer', toAccountId: 'b' })],
    });

    useFinanceStore.getState().deleteAccount('b');
    expect(useFinanceStore.getState().recurring).toEqual([]);
  });
});

describe('v7 migration', () => {
  it('gives existing budgets and rules their pre-v7 behaviour explicitly', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 6,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          budgets: [{ id: 'b1', categoryId: 'cat-1', amount: 500, createdAt: '2026-01-01' }],
          recurring: [
            {
              id: 'r1',
              type: 'expense',
              amount: 10,
              accountId: 'a',
              categoryId: 'cat-1',
              note: '',
              labels: [],
              frequency: 'monthly',
              startDate: '2026-01-01T00:00:00.000Z',
              lastRunDate: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          settings: { theme: 'dark', userName: 'Alex', autoLocalBackup: false },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const state = useFinanceStore.getState();

    expect(state.budgets[0]).toMatchObject({ period: 'monthly', rollover: false });
    expect(state.recurring[0].occurrenceCount).toBe(0);
    expect(state.settings.monthStartDay).toBe(1);
    expect(state.settings.userName).toBe('Alex');
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

describe('v8 migration', () => {
  it('seeds hideAmounts and an empty templates array for pre-v8 state', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 7,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          settings: { theme: 'dark', userName: 'Alex', autoLocalBackup: false, monthStartDay: 1 },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const state = useFinanceStore.getState();

    expect(state.settings.hideAmounts).toBe(false);
    expect(state.settings.userName).toBe('Alex');
    expect(state.templates).toEqual([]);
  });
});

describe('v6 migration', () => {
  it('marks an existing install as onboarded so the first-run wizard stays hidden', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 5,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          settings: { theme: 'dark', userName: 'Alex', autoLocalBackup: false },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const { settings } = useFinanceStore.getState();

    expect(settings.onboardedAt).toEqual(expect.any(String));
    // The migration must not overwrite settings the user already chose.
    expect(settings.userName).toBe('Alex');
    expect(settings.theme).toBe('dark');
  });

  it('leaves a fresh install un-onboarded so the wizard runs', () => {
    expect(defaultSettings.onboardedAt).toBeUndefined();
    expect(defaultSettings.userName).toBe('');
  });

  it('keeps the user onboarded after a data reset', () => {
    useFinanceStore.setState({
      settings: { ...defaultSettings, userName: 'Riya', onboardedAt: '2026-01-01T00:00:00.000Z' },
    });
    seed([account('a', 100)], [tx({ id: 't1', type: 'expense', amount: 10, accountId: 'a' })]);

    useFinanceStore.getState().resetToDefaults();

    const state = useFinanceStore.getState();
    expect(state.accounts).toEqual([]);
    expect(state.transactions).toEqual([]);
    expect(state.settings.onboardedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.settings.userName).toBe('Riya');
  });
});
