import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { addDays, addMonths, addWeeks, addYears, isAfter, parseISO } from 'date-fns';
import {
  MISC_CATEGORY_ID,
  defaultCategories,
  defaultLabels,
  defaultSettings,
} from '@/data/defaultData';
import type {
  Account,
  Budget,
  Category,
  FinanceStore,
  Label,
  RecurringTransaction,
  Transaction,
} from '@/types';

function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function applyBalanceDelta(
  accounts: Account[],
  tx: Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'amount'>,
  direction: 1 | -1,
): Account[] {
  return accounts.map((account) => {
    if (tx.type === 'expense' && account.id === tx.accountId) {
      return { ...account, balance: account.balance - direction * tx.amount };
    }
    if (tx.type === 'income' && account.id === tx.accountId) {
      return { ...account, balance: account.balance + direction * tx.amount };
    }
    if (tx.type === 'transfer') {
      if (account.id === tx.accountId) {
        return { ...account, balance: account.balance - direction * tx.amount };
      }
      if (tx.toAccountId && account.id === tx.toAccountId) {
        return { ...account, balance: account.balance + direction * tx.amount };
      }
    }
    return account;
  });
}

/** Safety cap on how many occurrences a single rule may generate in one pass. */
const MAX_OCCURRENCES_PER_RULE = 365;

function nextOccurrence(date: Date, freq: RecurringTransaction['frequency']): Date {
  switch (freq) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
  }
}

const defaultState = {
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  categories: defaultCategories,
  labels: defaultLabels,
  budgets: [] as Budget[],
  recurring: [] as RecurringTransaction[],
  settings: defaultSettings,
  isHydrated: false,
  lastLocalBackupAt: null as string | null,
};

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      setLastLocalBackupAt: (date) => set({ lastLocalBackupAt: date }),

      addAccount: (accountData) => {
        const account: Account = {
          ...accountData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ accounts: [...state.accounts, account] }));
      },

      updateAccount: (id, updates) => {
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        }));
      },

      deleteAccount: (id) => {
        set((state) => {
          const removed = state.transactions.filter(
            (t) => t.accountId === id || t.toAccountId === id,
          );

          // Reverse each removed transaction before dropping it, otherwise the *other*
          // side of a transfer keeps a balance it no longer has any transaction for.
          let accounts = state.accounts;
          for (const tx of removed) accounts = applyBalanceDelta(accounts, tx, -1);

          return {
            accounts: accounts.filter((a) => a.id !== id),
            transactions: state.transactions.filter(
              (t) => t.accountId !== id && t.toAccountId !== id,
            ),
            recurring: state.recurring.filter((r) => r.accountId !== id),
          };
        });
      },

      addTransaction: (txData) => {
        const transaction: Transaction = {
          ...txData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          transactions: [transaction, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, transaction, 1),
        }));
        return transaction.id;
      },

      updateTransaction: (id, updates) => {
        set((state) => {
          const originalTx = state.transactions.find((t) => t.id === id);
          if (!originalTx) return state;

          const updatedTx = { ...originalTx, ...updates };
          const afterReverse = applyBalanceDelta(state.accounts, originalTx, -1);
          const finalAccounts = applyBalanceDelta(afterReverse, updatedTx, 1);

          return {
            transactions: state.transactions.map((t) => (t.id === id ? updatedTx : t)),
            accounts: finalAccounts,
          };
        });
      },

      deleteTransaction: (id) => {
        set((state) => {
          const tx = state.transactions.find((t) => t.id === id);
          if (!tx) return state;

          return {
            transactions: state.transactions.filter((t) => t.id !== id),
            accounts: applyBalanceDelta(state.accounts, tx, -1),
          };
        });
      },

      addCategory: (categoryData) => {
        const category: Category = {
          ...categoryData,
          id: generateUUID(),
        };
        set((state) => ({ categories: [...state.categories, category] }));
      },

      updateCategory: (id, updates) => {
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      deleteCategory: (id) => {
        set((state) => {
          const remaining = state.categories.filter((c) => c.id !== id);

          // Rows pointing at a deleted category would otherwise render as "Unknown" and
          // silently vanish from the spending charts. Reassign them to a surviving
          // catch-all instead.
          const fallbackId =
            remaining.find((c) => c.id === MISC_CATEGORY_ID)?.id ??
            remaining.find((c) => c.type === 'both')?.id ??
            '';

          return {
            categories: remaining,
            budgets: state.budgets.filter((b) => b.categoryId !== id),
            transactions: state.transactions.map((t) =>
              t.categoryId === id ? { ...t, categoryId: fallbackId } : t,
            ),
            recurring: state.recurring.map((r) =>
              r.categoryId === id ? { ...r, categoryId: fallbackId } : r,
            ),
          };
        });
      },

      addLabel: (labelData) => {
        const label: Label = {
          ...labelData,
          id: generateUUID(),
        };
        set((state) => ({ labels: [...state.labels, label] }));
      },

      updateLabel: (id, updates) => {
        set((state) => ({
          labels: state.labels.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        }));
      },

      deleteLabel: (id) => {
        set((state) => {
          const anyHasLabel = state.transactions.some((t) => t.labels.includes(id));
          return {
            labels: state.labels.filter((l) => l.id !== id),
            transactions: anyHasLabel
              ? state.transactions.map((t) =>
                  t.labels.includes(id)
                    ? { ...t, labels: t.labels.filter((lId) => lId !== id) }
                    : t,
                )
              : state.transactions,
          };
        });
      },

      addBudget: (budgetData) => {
        const budget: Budget = {
          ...budgetData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          // Replace any existing budget for the same category (only one per category)
          budgets: [...state.budgets.filter((b) => b.categoryId !== budget.categoryId), budget],
        }));
      },

      updateBudget: (id, updates) => {
        set((state) => ({
          budgets: state.budgets.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        }));
      },

      deleteBudget: (id) => {
        set((state) => ({ budgets: state.budgets.filter((b) => b.id !== id) }));
      },

      addRecurring: (ruleData) => {
        const rule: RecurringTransaction = {
          ...ruleData,
          id: generateUUID(),
          lastRunDate: null,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ recurring: [...state.recurring, rule] }));
      },

      updateRecurring: (id, updates) => {
        set((state) => ({
          recurring: state.recurring.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      deleteRecurring: (id) => {
        set((state) => ({ recurring: state.recurring.filter((r) => r.id !== id) }));
      },

      processRecurring: () => {
        let generated = 0;
        const now = new Date();
        const state = get();
        const newTxns: Transaction[] = [];
        const updatedRules = state.recurring.map((rule) => {
          // Skip if account no longer exists.
          if (!state.accounts.some((a) => a.id === rule.accountId)) return rule;

          let next = rule.lastRunDate
            ? nextOccurrence(parseISO(rule.lastRunDate), rule.frequency)
            : parseISO(rule.startDate);

          let lastRun = rule.lastRunDate ? parseISO(rule.lastRunDate) : null;
          let ruleGenerated = 0;

          while (!isAfter(next, now) && ruleGenerated < MAX_OCCURRENCES_PER_RULE) {
            newTxns.push({
              id: generateUUID(),
              type: rule.type,
              amount: rule.amount,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              date: next.toISOString(),
              note: rule.note,
              labels: [...rule.labels],
              createdAt: new Date().toISOString(),
              recurringId: rule.id,
            });
            generated += 1;
            ruleGenerated += 1;
            lastRun = next;
            next = nextOccurrence(next, rule.frequency);
          }

          return lastRun ? { ...rule, lastRunDate: lastRun.toISOString() } : rule;
        });

        if (generated === 0) return 0;

        set((s) => {
          let accounts = s.accounts;
          for (const tx of newTxns) accounts = applyBalanceDelta(accounts, tx, 1);
          return {
            transactions: [...newTxns, ...s.transactions],
            accounts,
            recurring: updatedRules,
          };
        });

        return generated;
      },

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      resetToDefaults: () => {
        set({
          accounts: [],
          transactions: [],
          categories: defaultCategories,
          labels: defaultLabels,
          budgets: [],
          recurring: [],
          settings: defaultSettings,
        });
      },

      importData: (data) => {
        set((state) => ({
          accounts: Array.isArray(data.accounts) ? data.accounts : state.accounts,
          transactions: Array.isArray(data.transactions) ? data.transactions : state.transactions,
          categories: Array.isArray(data.categories) ? data.categories : state.categories,
          labels: Array.isArray(data.labels) ? data.labels : state.labels,
          budgets: Array.isArray(data.budgets) ? data.budgets : state.budgets,
          recurring: Array.isArray(data.recurring) ? data.recurring : state.recurring,
          settings:
            data.settings && typeof data.settings === 'object'
              ? { ...state.settings, ...data.settings }
              : state.settings,
        }));
      },
    }),
    {
      name: 'finio-storage',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, version) => {
        const s = (persistedState ?? {}) as Partial<FinanceStore>;
        if (version < 2) {
          return {
            ...s,
            budgets: Array.isArray(s.budgets) ? s.budgets : [],
            recurring: Array.isArray(s.recurring) ? s.recurring : [],
          } as FinanceStore;
        }
        if (version < 3) {
          return {
            ...s,
            lastLocalBackupAt: null,
            settings: {
              ...defaultSettings,
              ...(s.settings ?? {}),
              autoLocalBackup: false,
            },
          } as FinanceStore;
        }
        return s as FinanceStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    },
  ),
);

// ─── Granular selectors (prevent unnecessary re-renders) ─────────────
export const useAccounts = () => useFinanceStore((s) => s.accounts);
export const useTransactions = () => useFinanceStore((s) => s.transactions);
export const useCategories = () => useFinanceStore((s) => s.categories);
export const useLabels = () => useFinanceStore((s) => s.labels);
export const useBudgets = () => useFinanceStore((s) => s.budgets);
export const useRecurring = () => useFinanceStore((s) => s.recurring);
export const useSettings = () => useFinanceStore((s) => s.settings);
export const useCurrency = () => useFinanceStore((s) => s.settings.currency);
