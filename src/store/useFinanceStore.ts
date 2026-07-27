import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  MISC_CATEGORY_ID,
  defaultCategories,
  defaultLabels,
  defaultSettings,
} from '@/data/defaultData';
import {
  applyBalanceDelta,
  backfillOpeningBalances,
  diffBalances,
  recomputeAccountBalances,
  roundMoney,
  sumTransactionDeltas,
} from './balance';
import { planRecurring } from './recurring';
import type {
  Account,
  Budget,
  Category,
  FinanceStore,
  ImportedAccount,
  Label,
  RecurringTransaction,
  Settings,
  Transaction,
} from '@/types';

/**
 * Multi-currency was removed in v4 (the app is INR-only). Persisted state and older
 * backup files still carry `currency` on settings and accounts — drop it on the way in
 * so it does not linger in storage or get re-uploaded on the next backup.
 */
function dropLegacyCurrency<T extends object>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const next = { ...value } as Record<string, unknown>;
  delete next.currency;
  return next as T;
}

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

/** Union two collections by id, with `incoming` winning on conflicts. */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[] | undefined): T[] {
  if (!incoming) return existing;
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return Array.from(byId.values());
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
          // A brand-new account has no transactions, so the balance the user typed *is*
          // the opening balance.
          openingBalance: accountData.balance,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ accounts: [...state.accounts, account] }));
      },

      updateAccount: (id, updates) => {
        set((state) => {
          const target = state.accounts.find((a) => a.id === id);
          if (!target) return state;

          const next = { ...target, ...updates };

          // Editing the balance is a statement about the *current* balance, so shift the
          // opening balance by the same amount to keep
          // `balance === openingBalance + Σ deltas` true.
          if (
            updates.balance !== undefined &&
            updates.openingBalance === undefined &&
            updates.balance !== target.balance
          ) {
            const delta = sumTransactionDeltas(state.transactions).get(id) ?? 0;
            next.openingBalance = roundMoney(updates.balance - delta);
          }

          return { accounts: state.accounts.map((a) => (a.id === id ? next : a)) };
        });
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

      recomputeBalances: () => {
        const before = get().accounts;
        const after = recomputeAccountBalances(before, get().transactions);
        const result = diffBalances(before, after);
        if (result.changed > 0) set({ accounts: after });
        return result;
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
        const state = get();
        const plan = planRecurring(
          state.recurring,
          state.accounts.map((a) => a.id),
          new Date(),
        );
        if (plan.occurrences.length === 0) return 0;

        const createdAt = new Date().toISOString();
        const newTxns: Transaction[] = plan.occurrences.map(({ rule, date }) => ({
          id: generateUUID(),
          type: rule.type,
          amount: rule.amount,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          date: date.toISOString(),
          note: rule.note,
          labels: [...rule.labels],
          createdAt,
          recurringId: rule.id,
        }));

        set((s) => {
          let accounts = s.accounts;
          for (const tx of newTxns) accounts = applyBalanceDelta(accounts, tx, 1);
          return {
            transactions: [...newTxns, ...s.transactions],
            accounts,
            recurring: plan.rules,
          };
        });

        return newTxns.length;
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

      importData: (data, options) => {
        const mode = options?.mode ?? 'merge';

        set((state) => {
          const incomingAccounts = data.accounts?.map(dropLegacyCurrency);

          const next =
            mode === 'merge'
              ? {
                  accounts: mergeById<ImportedAccount>(state.accounts, incomingAccounts),
                  transactions: mergeById(state.transactions, data.transactions),
                  categories: mergeById(state.categories, data.categories),
                  labels: mergeById(state.labels, data.labels),
                  budgets: mergeById(state.budgets, data.budgets),
                  recurring: mergeById(state.recurring, data.recurring),
                }
              : {
                  accounts: (incomingAccounts ?? state.accounts) as ImportedAccount[],
                  transactions: data.transactions ?? state.transactions,
                  categories: data.categories ?? state.categories,
                  labels: data.labels ?? state.labels,
                  budgets: data.budgets ?? state.budgets,
                  recurring: data.recurring ?? state.recurring,
                };

          return {
            ...next,
            // Imported accounts may predate `openingBalance`, or carry a `balance` that no
            // longer matches the transaction set they arrived with. Derive what is missing,
            // then rebuild every balance from it.
            accounts: recomputeAccountBalances(
              backfillOpeningBalances(next.accounts, next.transactions),
              next.transactions,
            ),
            settings: data.settings
              ? dropLegacyCurrency({ ...state.settings, ...data.settings })
              : state.settings,
          };
        });
      },
    }),
    {
      name: 'finio-storage',
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // Steps are cumulative: a v1 state falls through every branch in order.
      migrate: (persistedState, version) => {
        let s = (persistedState ?? {}) as Partial<FinanceStore>;

        if (version < 2) {
          s = {
            ...s,
            budgets: Array.isArray(s.budgets) ? s.budgets : [],
            recurring: Array.isArray(s.recurring) ? s.recurring : [],
          };
        }

        if (version < 3) {
          s = {
            ...s,
            lastLocalBackupAt: null,
            settings: {
              ...defaultSettings,
              ...(s.settings ?? {}),
              autoLocalBackup: false,
            },
          };
        }

        if (version < 4) {
          // Multi-currency removed — the app is INR-only.
          s = {
            ...s,
            settings: dropLegacyCurrency({
              ...defaultSettings,
              ...(s.settings ?? {}),
            } as Settings),
            accounts: Array.isArray(s.accounts) ? s.accounts.map(dropLegacyCurrency) : s.accounts,
          };
        }

        if (version < 5) {
          // Seed `openingBalance` from the stored balance minus the transactions that
          // produced it, so existing balances are preserved exactly and become
          // recomputable from here on.
          s = {
            ...s,
            accounts: Array.isArray(s.accounts)
              ? backfillOpeningBalances(
                  s.accounts,
                  Array.isArray(s.transactions) ? s.transactions : [],
                )
              : s.accounts,
          };
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
