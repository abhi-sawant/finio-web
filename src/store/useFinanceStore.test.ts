import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNetWorth, getTotalAccountBalance } from '@/utils/calculations';
import { defaultSettings } from '@/data/defaultData';
import type {
  Account,
  CategoryRule,
  ImportPayload,
  RecurringTransaction,
  Transaction,
} from '@/types';

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

  it('clears splits when flattening a split transaction to a single category', () => {
    seed(
      [account('a', 100)],
      [
        tx({
          id: 't1',
          type: 'expense',
          amount: 100,
          accountId: 'a',
          categoryId: '',
          splits: [
            { categoryId: 'cat-1', amount: 60 },
            { categoryId: 'cat-2', amount: 40 },
          ],
        }),
      ],
    );

    useFinanceStore.getState().bulkRecategorize(['t1'], 'cat-3');

    const t1 = useFinanceStore.getState().transactions.find((t) => t.id === 't1');
    expect(t1?.categoryId).toBe('cat-3');
    expect(t1?.splits).toBeUndefined();
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

describe('bulkAddTransactions', () => {
  it('inserts every row with fresh ids/createdAt and applies balance deltas', () => {
    seed([account('a', 1000)]);

    const added = useFinanceStore.getState().bulkAddTransactions([
      {
        type: 'expense',
        amount: 100,
        accountId: 'a',
        categoryId: 'cat-1',
        date: '2026-06-01T00:00:00.000Z',
        note: 'Coffee',
        labels: [],
      },
      {
        type: 'income',
        amount: 5000,
        accountId: 'a',
        categoryId: 'cat-1',
        date: '2026-06-02T00:00:00.000Z',
        note: 'Salary',
        labels: [],
      },
    ]);

    expect(added).toBe(2);
    const state = useFinanceStore.getState();
    expect(state.transactions).toHaveLength(2);
    expect(state.transactions.every((t) => t.id && t.createdAt)).toBe(true);
    // 1000 - 100 (expense) + 5000 (income) = 5900.
    expect(state.accounts[0].balance).toBe(5900);
  });

  it('returns 0 and changes nothing for an empty list', () => {
    seed([account('a', 100)]);
    expect(useFinanceStore.getState().bulkAddTransactions([])).toBe(0);
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
  });
});

describe('deleteCategory with split transactions', () => {
  it('reassigns a dangling split entry to the fallback category', () => {
    seed(
      [account('a', 100)],
      [
        tx({
          id: 't1',
          type: 'expense',
          amount: 150,
          accountId: 'a',
          categoryId: '',
          splits: [
            { categoryId: 'cat-1', amount: 100 },
            { categoryId: 'cat-2', amount: 50 },
          ],
        }),
      ],
    );

    useFinanceStore.getState().deleteCategory('cat-1');

    const t1 = useFinanceStore.getState().transactions.find((t) => t.id === 't1');
    expect(t1?.splits).toEqual([
      { categoryId: 'cat-24', amount: 100 },
      { categoryId: 'cat-2', amount: 50 },
    ]);
  });

  it('merges duplicate categories and collapses a split down to a plain category', () => {
    seed(
      [account('a', 150)],
      [
        tx({
          id: 't1',
          type: 'expense',
          amount: 150,
          accountId: 'a',
          categoryId: '',
          splits: [
            { categoryId: 'cat-1', amount: 100 },
            { categoryId: 'cat-24', amount: 50 },
          ],
        }),
      ],
    );

    useFinanceStore.getState().deleteCategory('cat-1');

    const t1 = useFinanceStore.getState().transactions.find((t) => t.id === 't1');
    expect(t1?.splits).toBeUndefined();
    expect(t1?.categoryId).toBe('cat-24');
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

describe('categorization rules', () => {
  function addUberRule(overrides: Partial<Omit<CategoryRule, 'id' | 'createdAt'>> = {}) {
    return useFinanceStore.getState().addRule({
      pattern: 'uber',
      matchType: 'contains',
      scope: 'any',
      categoryId: 'cat-2',
      labelIds: ['lbl-1'],
      enabled: true,
      ...overrides,
    });
  }

  it('appends new rules so an existing rule keeps its priority', () => {
    addUberRule({ pattern: 'first' });
    addUberRule({ pattern: 'second' });
    expect(useFinanceStore.getState().rules.map((r) => r.pattern)).toEqual(['first', 'second']);
  });

  it('moveRule swaps neighbours and stops at the ends', () => {
    const a = addUberRule({ pattern: 'a' });
    const b = addUberRule({ pattern: 'b' });

    useFinanceStore.getState().moveRule(b, 'up');
    expect(useFinanceStore.getState().rules.map((r) => r.pattern)).toEqual(['b', 'a']);

    useFinanceStore.getState().moveRule(b, 'up');
    expect(useFinanceStore.getState().rules.map((r) => r.pattern)).toEqual(['b', 'a']);

    useFinanceStore.getState().moveRule(a, 'down');
    expect(useFinanceStore.getState().rules.map((r) => r.pattern)).toEqual(['b', 'a']);
  });

  it('applyRulesToExisting recategorizes matching rows and reports them for undo', () => {
    seed(
      [account('a', 1000)],
      [
        tx({ id: 't1', type: 'expense', amount: 100, accountId: 'a', note: 'Uber to work' }),
        tx({ id: 't2', type: 'expense', amount: 50, accountId: 'a', note: 'Groceries' }),
      ],
    );
    addUberRule();

    const { changed, previous } = useFinanceStore.getState().applyRulesToExisting();
    expect(changed).toBe(1);

    const [t1, t2] = useFinanceStore.getState().transactions;
    expect(t1).toMatchObject({ id: 't1', categoryId: 'cat-2', labels: ['lbl-1'] });
    expect(t2).toMatchObject({ id: 't2', categoryId: 'cat-1', labels: [] });

    useFinanceStore.getState().restoreCategorization(previous);
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      categoryId: 'cat-1',
      labels: [],
    });
  });

  it('leaves balances alone — recategorizing is not a money change', () => {
    seed(
      [account('a', 900, 1000)],
      [tx({ id: 't1', type: 'expense', amount: 100, accountId: 'a', note: 'Uber' })],
    );
    addUberRule();

    useFinanceStore.getState().applyRulesToExisting();
    expect(useFinanceStore.getState().accounts[0].balance).toBe(900);
  });

  it('restricts the replay to one category when asked', () => {
    seed(
      [account('a', 1000)],
      [
        tx({
          id: 't1',
          type: 'expense',
          amount: 10,
          accountId: 'a',
          note: 'Uber',
          categoryId: 'cat-24',
        }),
        tx({
          id: 't2',
          type: 'expense',
          amount: 10,
          accountId: 'a',
          note: 'Uber',
          categoryId: 'cat-3',
        }),
      ],
    );
    addUberRule();

    const { changed } = useFinanceStore
      .getState()
      .applyRulesToExisting({ restrictToCategoryId: 'cat-24' });
    expect(changed).toBe(1);
    expect(useFinanceStore.getState().transactions[1].categoryId).toBe('cat-3');
  });

  it('deleting a category repoints rules at the fallback instead of orphaning them', () => {
    addUberRule({ categoryId: 'cat-2' });
    useFinanceStore.getState().deleteCategory('cat-2');
    expect(useFinanceStore.getState().rules[0].categoryId).toBe('cat-24');
  });

  it('deleting a label strips it from every rule that applied it', () => {
    addUberRule({ labelIds: ['lbl-1', 'lbl-2'] });
    useFinanceStore.getState().deleteLabel('lbl-1');
    expect(useFinanceStore.getState().rules[0].labelIds).toEqual(['lbl-2']);
  });

  it('is cleared by resetToDefaults, same as every other finance collection', () => {
    addUberRule();
    useFinanceStore.getState().resetToDefaults();
    expect(useFinanceStore.getState().rules).toEqual([]);
  });
});

describe('addGoal / updateGoal / deleteGoal', () => {
  it('creates a goal and returns its id', () => {
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });

    const [created] = useFinanceStore.getState().goals;
    expect(created.id).toBe(id);
    expect(created.name).toBe('Emergency Fund');
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('updates only the given fields', () => {
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });

    useFinanceStore.getState().updateGoal(id, { targetAmount: 15000 });
    const [updated] = useFinanceStore.getState().goals;
    expect(updated.targetAmount).toBe(15000);
    expect(updated.name).toBe('Emergency Fund');
  });

  it('deleting a goal removes every contribution logged against it, not other goals', () => {
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });
    const otherId = useFinanceStore.getState().addGoal({
      name: 'Vacation',
      icon: 'plane',
      color: '#f59e0b',
      targetAmount: 5000,
    });
    useFinanceStore.getState().addContribution({ goalId: id, amount: 1000, date: '', note: '' });
    useFinanceStore
      .getState()
      .addContribution({ goalId: otherId, amount: 500, date: '', note: '' });

    useFinanceStore.getState().deleteGoal(id);

    const state = useFinanceStore.getState();
    expect(state.goals.map((g) => g.id)).toEqual([otherId]);
    expect(state.goalContributions.map((c) => c.goalId)).toEqual([otherId]);
  });

  it('deleting a goal drops the link from any recurring rule funding it, not the rule itself', () => {
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });
    const ruleId = useFinanceStore.getState().addRecurring({
      type: 'expense',
      amount: 500,
      accountId: 'a',
      categoryId: 'cat-1',
      note: '',
      labels: [],
      frequency: 'monthly',
      startDate: '2026-01-01T00:00:00.000Z',
      goalId: id,
    });

    useFinanceStore.getState().deleteGoal(id);

    const rule = useFinanceStore.getState().recurring.find((r) => r.id === ruleId);
    expect(rule).toBeDefined();
    expect(rule?.goalId).toBeUndefined();
  });

  it('is cleared by resetToDefaults, same as every other finance collection', () => {
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });
    useFinanceStore.getState().addContribution({ goalId: id, amount: 1000, date: '', note: '' });

    useFinanceStore.getState().resetToDefaults();
    expect(useFinanceStore.getState().goals).toEqual([]);
    expect(useFinanceStore.getState().goalContributions).toEqual([]);
  });
});

describe('addContribution / deleteContribution / restoreContribution', () => {
  it('adds a contribution and returns its id', () => {
    const id = useFinanceStore
      .getState()
      .addContribution({ goalId: 'goal-1', amount: 500, date: '2026-01-05', note: 'Bonus' });

    const [created] = useFinanceStore.getState().goalContributions;
    expect(created.id).toBe(id);
    expect(created.amount).toBe(500);
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('deletes a contribution and returns the removed row for undo', () => {
    const id = useFinanceStore
      .getState()
      .addContribution({ goalId: 'goal-1', amount: 500, date: '2026-01-05', note: '' });

    const removed = useFinanceStore.getState().deleteContribution(id);
    expect(removed?.id).toBe(id);
    expect(useFinanceStore.getState().goalContributions).toEqual([]);
  });

  it('returns null when deleting a contribution that no longer exists', () => {
    expect(useFinanceStore.getState().deleteContribution('missing')).toBeNull();
  });

  it('restoreContribution re-inserts the exact row deleted, verbatim', () => {
    const id = useFinanceStore
      .getState()
      .addContribution({ goalId: 'goal-1', amount: 500, date: '2026-01-05', note: 'Bonus' });
    const removed = useFinanceStore.getState().deleteContribution(id)!;

    useFinanceStore.getState().restoreContribution(removed);
    expect(useFinanceStore.getState().goalContributions).toEqual([removed]);
  });

  it('guards against a double undo re-inserting the same contribution twice', () => {
    const id = useFinanceStore
      .getState()
      .addContribution({ goalId: 'goal-1', amount: 500, date: '2026-01-05', note: '' });
    const removed = useFinanceStore.getState().deleteContribution(id)!;

    useFinanceStore.getState().restoreContribution(removed);
    useFinanceStore.getState().restoreContribution(removed);
    expect(useFinanceStore.getState().goalContributions).toHaveLength(1);
  });
});

describe('deleteAccount clears dangling goal links', () => {
  it('drops linkedAccountId from a goal pointing at the deleted account, without deleting the goal', () => {
    seed([account('a', 1000)]);
    const id = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
      linkedAccountId: 'a',
    });

    useFinanceStore.getState().deleteAccount('a');

    const [goal] = useFinanceStore.getState().goals;
    expect(goal.id).toBe(id);
    expect(goal.linkedAccountId).toBeUndefined();
  });
});

describe('addPerson / updatePerson / deletePerson', () => {
  it('creates a person and returns its id', () => {
    const id = useFinanceStore
      .getState()
      .addPerson({ name: 'Rahul', icon: 'user', color: '#6C63FF' });

    const [created] = useFinanceStore.getState().people;
    expect(created.id).toBe(id);
    expect(created.name).toBe('Rahul');
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('updates only the given fields', () => {
    const id = useFinanceStore
      .getState()
      .addPerson({ name: 'Rahul', icon: 'user', color: '#6C63FF' });

    useFinanceStore.getState().updatePerson(id, { name: 'Rahul Sharma' });
    const [updated] = useFinanceStore.getState().people;
    expect(updated.name).toBe('Rahul Sharma');
    expect(updated.icon).toBe('user');
  });

  it('deleting a person removes every debt entry logged against them, not other people', () => {
    const id = useFinanceStore
      .getState()
      .addPerson({ name: 'Rahul', icon: 'user', color: '#6C63FF' });
    const otherId = useFinanceStore
      .getState()
      .addPerson({ name: 'Priya', icon: 'user', color: '#f59e0b' });
    useFinanceStore.getState().addDebtEntry({ personId: id, amount: 500, date: '', note: '' });
    useFinanceStore.getState().addDebtEntry({ personId: otherId, amount: 200, date: '', note: '' });

    useFinanceStore.getState().deletePerson(id);

    const state = useFinanceStore.getState();
    expect(state.people.map((p) => p.id)).toEqual([otherId]);
    expect(state.debtEntries.map((e) => e.personId)).toEqual([otherId]);
  });

  it('is cleared by resetToDefaults, same as every other finance collection', () => {
    const id = useFinanceStore
      .getState()
      .addPerson({ name: 'Rahul', icon: 'user', color: '#6C63FF' });
    useFinanceStore.getState().addDebtEntry({ personId: id, amount: 500, date: '', note: '' });

    useFinanceStore.getState().resetToDefaults();
    expect(useFinanceStore.getState().people).toEqual([]);
    expect(useFinanceStore.getState().debtEntries).toEqual([]);
  });
});

describe('addDebtEntry / deleteDebtEntry / restoreDebtEntry', () => {
  it('adds an entry and returns its id', () => {
    const id = useFinanceStore
      .getState()
      .addDebtEntry({ personId: 'person-1', amount: 500, date: '2026-01-05', note: 'Lunch' });

    const [created] = useFinanceStore.getState().debtEntries;
    expect(created.id).toBe(id);
    expect(created.amount).toBe(500);
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('deletes an entry and returns the removed row for undo', () => {
    const id = useFinanceStore
      .getState()
      .addDebtEntry({ personId: 'person-1', amount: 500, date: '2026-01-05', note: '' });

    const removed = useFinanceStore.getState().deleteDebtEntry(id);
    expect(removed?.id).toBe(id);
    expect(useFinanceStore.getState().debtEntries).toEqual([]);
  });

  it('returns null when deleting an entry that no longer exists', () => {
    expect(useFinanceStore.getState().deleteDebtEntry('missing')).toBeNull();
  });

  it('restoreDebtEntry re-inserts the exact row deleted, verbatim', () => {
    const id = useFinanceStore
      .getState()
      .addDebtEntry({ personId: 'person-1', amount: 500, date: '2026-01-05', note: 'Lunch' });
    const removed = useFinanceStore.getState().deleteDebtEntry(id)!;

    useFinanceStore.getState().restoreDebtEntry(removed);
    expect(useFinanceStore.getState().debtEntries).toEqual([removed]);
  });

  it('guards against a double undo re-inserting the same entry twice', () => {
    const id = useFinanceStore
      .getState()
      .addDebtEntry({ personId: 'person-1', amount: 500, date: '2026-01-05', note: '' });
    const removed = useFinanceStore.getState().deleteDebtEntry(id)!;

    useFinanceStore.getState().restoreDebtEntry(removed);
    useFinanceStore.getState().restoreDebtEntry(removed);
    expect(useFinanceStore.getState().debtEntries).toHaveLength(1);
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

  it('merges goals and contributions by id, same as every other collection', () => {
    const localId = useFinanceStore.getState().addGoal({
      name: 'Local Goal',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 1000,
    });

    useFinanceStore.getState().importData(
      {
        goals: [
          {
            id: 'imported-goal',
            name: 'Imported Goal',
            icon: 'plane',
            color: '#f59e0b',
            targetAmount: 5000,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        goalContributions: [
          {
            id: 'imported-contrib',
            goalId: 'imported-goal',
            amount: 1000,
            date: '2026-01-02T00:00:00.000Z',
            note: '',
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
      { mode: 'merge' },
    );

    const state = useFinanceStore.getState();
    expect(state.goals.map((g) => g.id).sort()).toEqual([localId, 'imported-goal'].sort());
    expect(state.goalContributions.map((c) => c.id)).toEqual(['imported-contrib']);
  });

  it('merges people and debt entries by id, same as every other collection', () => {
    const localId = useFinanceStore
      .getState()
      .addPerson({ name: 'Local Person', icon: 'user', color: '#6C63FF' });

    useFinanceStore.getState().importData(
      {
        people: [
          {
            id: 'imported-person',
            name: 'Imported Person',
            icon: 'handshake',
            color: '#f59e0b',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        debtEntries: [
          {
            id: 'imported-entry',
            personId: 'imported-person',
            amount: 500,
            date: '2026-01-02T00:00:00.000Z',
            note: '',
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
      { mode: 'merge' },
    );

    const state = useFinanceStore.getState();
    expect(state.people.map((p) => p.id).sort()).toEqual([localId, 'imported-person'].sort());
    expect(state.debtEntries.map((e) => e.id)).toEqual(['imported-entry']);
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

    expect(useFinanceStore.getState().processRecurring()).toHaveLength(1);

    const state = useFinanceStore.getState();
    expect(state.transactions[0].toAccountId).toBe('b');
    expect(state.accounts.find((a) => a.id === 'a')?.balance).toBe(700);
    expect(state.accounts.find((a) => a.id === 'b')?.balance).toBe(800);
    expect(state.recurring[0].occurrenceCount).toBe(1);
    // And the rule is spent — a second pass adds nothing.
    expect(useFinanceStore.getState().processRecurring()).toHaveLength(0);
  });

  it('skips a transfer rule whose destination account is gone', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({
      recurring: [recurringRule({ type: 'transfer', toAccountId: 'missing' })],
    });

    expect(useFinanceStore.getState().processRecurring()).toHaveLength(0);
    expect(useFinanceStore.getState().accounts[0].balance).toBe(1000);
  });

  it('generates nothing while paused and resumes cleanly', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({ recurring: [recurringRule()] });

    useFinanceStore.getState().setRecurringPaused('r1', true);
    expect(useFinanceStore.getState().processRecurring()).toHaveLength(0);

    useFinanceStore.getState().setRecurringPaused('r1', false);
    expect('pausedAt' in useFinanceStore.getState().recurring[0]).toBe(false);
    expect(useFinanceStore.getState().processRecurring()).toHaveLength(1);
  });

  it('returns the generated rows so a caller can undo them via bulkDeleteTransactions', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({ recurring: [recurringRule()] });

    const generated = useFinanceStore.getState().processRecurring();
    expect(generated).toHaveLength(1);
    expect(generated[0].recurringId).toBe('r1');

    useFinanceStore.getState().bulkDeleteTransactions(generated.map((t) => t.id));
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
    expect(useFinanceStore.getState().accounts[0].balance).toBe(1000);
  });

  it('drops transfer rules that pointed at a deleted account', () => {
    seed([account('a', 1000), account('b', 500)]);
    useFinanceStore.setState({
      recurring: [recurringRule({ type: 'transfer', toAccountId: 'b' })],
    });

    useFinanceStore.getState().deleteAccount('b');
    expect(useFinanceStore.getState().recurring).toEqual([]);
  });

  it('auto-funds a linked goal with a matching contribution on each occurrence', () => {
    seed([account('a', 1000)]);
    const goalId = useFinanceStore.getState().addGoal({
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
    });
    useFinanceStore.setState({ recurring: [recurringRule({ goalId })] });

    useFinanceStore.getState().processRecurring();

    const { goalContributions } = useFinanceStore.getState();
    expect(goalContributions).toHaveLength(1);
    expect(goalContributions[0]).toMatchObject({ goalId, amount: 300 });
  });

  it('never resurrects a contribution for a goal that no longer exists', () => {
    seed([account('a', 1000)]);
    useFinanceStore.setState({ recurring: [recurringRule({ goalId: 'deleted-goal' })] });

    useFinanceStore.getState().processRecurring();

    expect(useFinanceStore.getState().goalContributions).toEqual([]);
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

describe('v9 migration', () => {
  it('seeds empty goals and goalContributions arrays for pre-v9 state', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 8,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          settings: {
            theme: 'dark',
            userName: 'Alex',
            autoLocalBackup: false,
            monthStartDay: 1,
            hideAmounts: false,
          },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const state = useFinanceStore.getState();

    expect(state.goals).toEqual([]);
    expect(state.goalContributions).toEqual([]);
  });
});

describe('v10 migration', () => {
  it('seeds empty people and debtEntries arrays for pre-v10 state', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 9,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          settings: {
            theme: 'dark',
            userName: 'Alex',
            autoLocalBackup: false,
            monthStartDay: 1,
            hideAmounts: false,
          },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const state = useFinanceStore.getState();

    expect(state.people).toEqual([]);
    expect(state.debtEntries).toEqual([]);
  });
});

describe('v11 migration', () => {
  it('seeds an empty rules array for pre-v11 state, recategorizing nothing on upgrade', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 10,
        state: {
          accounts: [account('a', 100)],
          transactions: [
            tx({ id: 't1', type: 'expense', amount: 20, accountId: 'a', note: 'Uber' }),
          ],
          settings: {
            theme: 'dark',
            userName: 'Alex',
            autoLocalBackup: false,
            monthStartDay: 1,
            hideAmounts: false,
          },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();
    const state = useFinanceStore.getState();

    expect(state.rules).toEqual([]);
    expect(state.transactions[0].categoryId).toBe('cat-1');
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

describe('captureNetWorthSnapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('freezes each completed month once, and is a no-op on the next run', () => {
    seed(
      [account('a', 10000, 3000)],
      [
        tx({
          id: 't1',
          type: 'income',
          amount: 4000,
          accountId: 'a',
          date: '2026-04-10T00:00:00.000Z',
        }),
        tx({
          id: 't2',
          type: 'income',
          amount: 3000,
          accountId: 'a',
          date: '2026-05-10T00:00:00.000Z',
        }),
      ],
    );

    expect(useFinanceStore.getState().captureNetWorthSnapshots()).toBe(2);
    const snapshots = useFinanceStore.getState().netWorthSnapshots;
    expect(snapshots.map((s) => s.periodKey)).toEqual(['2026-04', '2026-05']);
    // April closed on 10000 minus May's 3000.
    expect(snapshots[0].assets).toBe(7000);

    expect(useFinanceStore.getState().captureNetWorthSnapshots()).toBe(0);
  });

  it('keeps a captured month steady when history is edited afterwards', () => {
    seed(
      [account('a', 10000, 6000)],
      [
        tx({
          id: 't1',
          type: 'income',
          amount: 4000,
          accountId: 'a',
          date: '2026-05-10T00:00:00.000Z',
        }),
      ],
    );
    useFinanceStore.getState().captureNetWorthSnapshots();
    const before = useFinanceStore.getState().netWorthSnapshots[0];

    useFinanceStore.getState().deleteTransaction('t1');

    expect(useFinanceStore.getState().netWorthSnapshots[0]).toEqual(before);
  });

  it('is cleared by resetToDefaults, same as every other finance collection', () => {
    seed(
      [account('a', 10000, 6000)],
      [
        tx({
          id: 't1',
          type: 'income',
          amount: 4000,
          accountId: 'a',
          date: '2026-05-10T00:00:00.000Z',
        }),
      ],
    );
    useFinanceStore.getState().captureNetWorthSnapshots();
    expect(useFinanceStore.getState().netWorthSnapshots).toHaveLength(1);

    useFinanceStore.getState().resetToDefaults();
    expect(useFinanceStore.getState().netWorthSnapshots).toEqual([]);
  });
});

describe('importData with net worth snapshots', () => {
  const snapshot = (periodKey: string, assets: number, createdAt: string) => ({
    id: `snap-${periodKey}-${createdAt}`,
    periodKey,
    date: `${periodKey}-28T23:59:59.999Z`,
    assets,
    liabilities: 0,
    createdAt,
  });

  it('keeps one snapshot per month, preferring the later capture', () => {
    useFinanceStore.setState({
      netWorthSnapshots: [snapshot('2026-04', 1000, '2026-05-01T00:00:00.000Z')],
    });

    useFinanceStore
      .getState()
      .importData(
        { netWorthSnapshots: [snapshot('2026-04', 2000, '2026-05-02T00:00:00.000Z')] },
        { mode: 'merge' },
      );

    const merged = useFinanceStore.getState().netWorthSnapshots;
    expect(merged).toHaveLength(1);
    expect(merged[0].assets).toBe(2000);
  });

  it('replaces the collection outright in replace mode', () => {
    useFinanceStore.setState({
      netWorthSnapshots: [snapshot('2026-03', 500, '2026-04-01T00:00:00.000Z')],
    });

    useFinanceStore
      .getState()
      .importData(
        { netWorthSnapshots: [snapshot('2026-04', 900, '2026-05-01T00:00:00.000Z')] },
        { mode: 'replace' },
      );

    expect(useFinanceStore.getState().netWorthSnapshots.map((s) => s.periodKey)).toEqual([
      '2026-04',
    ]);
  });
});

describe('v12 migration', () => {
  it('seeds an empty snapshot list for pre-v12 state', async () => {
    backing.set(
      'finio-storage',
      JSON.stringify({
        version: 11,
        state: {
          accounts: [account('a', 100)],
          transactions: [],
          settings: {
            theme: 'dark',
            userName: 'Alex',
            autoLocalBackup: false,
            monthStartDay: 1,
            hideAmounts: false,
          },
        },
      }),
    );

    await useFinanceStore.persist.rehydrate();

    expect(useFinanceStore.getState().netWorthSnapshots).toEqual([]);
  });
});

describe('v13 migration', () => {
  const preV13 = (settings: Record<string, unknown>) =>
    JSON.stringify({
      version: 12,
      state: {
        accounts: [account('a', 100)],
        transactions: [],
        settings: {
          theme: 'dark',
          userName: 'Alex',
          autoLocalBackup: false,
          monthStartDay: 1,
          hideAmounts: false,
          ...settings,
        },
      },
    });

  it('leaves reminders off, so an upgrade never opts anyone into notifications', async () => {
    backing.set('finio-storage', preV13({}));

    await useFinanceStore.persist.rehydrate();

    const { settings } = useFinanceStore.getState();
    expect(settings.notificationsEnabled).toBe(false);
  });

  it('defaults the per-trigger switches on, so the master switch alone is useful', async () => {
    backing.set('finio-storage', preV13({}));

    await useFinanceStore.persist.rehydrate();

    const { settings } = useFinanceStore.getState();
    expect(settings.notifyBills).toBe(true);
    expect(settings.notifyBudgets).toBe(true);
    expect(settings.notifyCreditDue).toBe(true);
    expect(settings.notifyLeadDays).toBe(2);
    expect(settings.notifyDailyLog).toBe(true);
  });

  it('preserves settings the user already chose', async () => {
    backing.set('finio-storage', preV13({ theme: 'dark', monthStartDay: 25 }));

    await useFinanceStore.persist.rehydrate();

    const { settings } = useFinanceStore.getState();
    expect(settings.theme).toBe('dark');
    expect(settings.userName).toBe('Alex');
    expect(settings.monthStartDay).toBe(25);
  });
});
