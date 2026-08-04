import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  MISC_CATEGORY_ID,
  NEW_DEFAULT_CATEGORY_IDS,
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
import { planRuleApplication } from '@/utils/autoCategorize';
import { budgetScopeKey } from '@/utils/calculations';
import { calculateEmi } from '@/utils/loan';
import { planNetWorthSnapshots } from '@/utils/netWorth';
import { normalizeMonthStartDay } from '@/utils/period';
import type {
  Account,
  Budget,
  Category,
  CategoryRule,
  DebtEntry,
  FinanceStore,
  Goal,
  GoalContribution,
  ImportedAccount,
  Label,
  Loan,
  LoanPrepayment,
  NetWorthSnapshot,
  Person,
  RecurringTransaction,
  Settings,
  Transaction,
  TransactionTemplate,
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

/**
 * Reassign a transaction off a deleted category to `fallbackId` — including inside `splits`,
 * where reassigning two entries onto the same fallback category merges them (summing their
 * amounts) so a split never lists the same category twice. If the merge collapses `splits`
 * down to a single entry, drop it entirely and fold back into a plain `categoryId` — a
 * length-1 "split" is just a normal category.
 */
function reassignTransactionCategory<T extends Pick<Transaction, 'categoryId' | 'splits'>>(
  t: T,
  deletedId: string,
  fallbackId: string,
): T {
  if (t.splits && t.splits.length > 0) {
    const merged = new Map<string, number>();
    for (const split of t.splits) {
      const categoryId = split.categoryId === deletedId ? fallbackId : split.categoryId;
      merged.set(categoryId, (merged.get(categoryId) ?? 0) + split.amount);
    }
    const splits = Array.from(merged, ([categoryId, amount]) => ({ categoryId, amount }));
    if (splits.length === 1) {
      return { ...t, categoryId: splits[0].categoryId, splits: undefined };
    }
    return { ...t, splits };
  }
  return t.categoryId === deletedId ? { ...t, categoryId: fallbackId } : t;
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

/**
 * One snapshot per financial month. Merging two devices' backups can bring in a second
 * snapshot for a month that already has one; the later capture wins, since it was taken with
 * more of that month's transactions actually recorded.
 */
function dedupeSnapshotsByPeriod(snapshots: NetWorthSnapshot[]): NetWorthSnapshot[] {
  const byPeriod = new Map<string, NetWorthSnapshot>();
  for (const snapshot of snapshots) {
    const existing = byPeriod.get(snapshot.periodKey);
    if (!existing || snapshot.createdAt > existing.createdAt) {
      byPeriod.set(snapshot.periodKey, snapshot);
    }
  }
  return Array.from(byPeriod.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

const defaultState = {
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  categories: defaultCategories,
  labels: defaultLabels,
  budgets: [] as Budget[],
  recurring: [] as RecurringTransaction[],
  templates: [] as TransactionTemplate[],
  rules: [] as CategoryRule[],
  goals: [] as Goal[],
  goalContributions: [] as GoalContribution[],
  people: [] as Person[],
  debtEntries: [] as DebtEntry[],
  netWorthSnapshots: [] as NetWorthSnapshot[],
  loans: [] as Loan[],
  loanPrepayments: [] as LoanPrepayment[],
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
        return account.id;
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

      setAccountArchived: (id, archived) => {
        set((state) => ({
          accounts: state.accounts.map((a) => {
            if (a.id !== id) return a;
            if (archived) return { ...a, archivedAt: new Date().toISOString() };
            if (!a.archivedAt) return a;
            // Drop the key rather than setting it undefined, so a reopened account
            // serializes identically to one that was never archived.
            const reopened = { ...a };
            delete reopened.archivedAt;
            return reopened;
          }),
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

          // A loan's EMI has nowhere to be paid from without this account — same fate as the
          // recurring rule below, which it is paired with.
          const orphanedLoanIds = new Set(
            state.loans.filter((l) => l.accountId === id).map((l) => l.id),
          );

          return {
            accounts: accounts.filter((a) => a.id !== id),
            transactions: state.transactions.filter(
              (t) => t.accountId !== id && t.toAccountId !== id,
            ),
            // A transfer rule pointing at the deleted account can never fire again either.
            recurring: state.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id),
            loans: state.loans.filter((l) => l.accountId !== id),
            loanPrepayments: state.loanPrepayments.filter((p) => !orphanedLoanIds.has(p.loanId)),
            // The link is informational only — drop it rather than leave a goal pointing at
            // an account that no longer exists.
            goals: state.goals.map((g) => {
              if (g.linkedAccountId !== id) return g;
              const next = { ...g };
              delete next.linkedAccountId;
              return next;
            }),
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
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx) return null;

        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
          accounts: applyBalanceDelta(state.accounts, tx, -1),
        }));
        return tx;
      },

      restoreTransaction: (transaction) => {
        set((state) => {
          // Guard against a double undo re-applying the delta twice.
          if (state.transactions.some((t) => t.id === transaction.id)) return state;

          return {
            transactions: [transaction, ...state.transactions],
            accounts: applyBalanceDelta(state.accounts, transaction, 1),
          };
        });
      },

      bulkDeleteTransactions: (ids) => {
        const idSet = new Set(ids);
        const removed = get().transactions.filter((t) => idSet.has(t.id));
        if (removed.length === 0) return [];

        set((state) => {
          let accounts = state.accounts;
          for (const tx of removed) accounts = applyBalanceDelta(accounts, tx, -1);
          return {
            transactions: state.transactions.filter((t) => !idSet.has(t.id)),
            accounts,
          };
        });
        return removed;
      },

      restoreTransactions: (transactions) => {
        set((state) => {
          const existingIds = new Set(state.transactions.map((t) => t.id));
          // Guard against a double undo re-applying deltas twice.
          const toRestore = transactions.filter((t) => !existingIds.has(t.id));
          if (toRestore.length === 0) return state;

          let accounts = state.accounts;
          for (const tx of toRestore) accounts = applyBalanceDelta(accounts, tx, 1);
          return {
            transactions: [...toRestore, ...state.transactions],
            accounts,
          };
        });
      },

      bulkRecategorize: (ids, categoryId) => {
        const idSet = new Set(ids);
        set((state) => ({
          transactions: state.transactions.map((t) =>
            idSet.has(t.id) ? { ...t, categoryId, splits: undefined } : t,
          ),
        }));
      },

      bulkAddLabel: (ids, labelId) => {
        const idSet = new Set(ids);
        set((state) => ({
          transactions: state.transactions.map((t) =>
            idSet.has(t.id) && !t.labels.includes(labelId)
              ? { ...t, labels: [...t.labels, labelId] }
              : t,
          ),
        }));
      },

      bulkAddTransactions: (rows) => {
        if (rows.length === 0) return 0;
        const createdAt = new Date().toISOString();
        const newTxns: Transaction[] = rows.map((row) => ({
          ...row,
          id: generateUUID(),
          createdAt,
        }));
        set((state) => {
          let accounts = state.accounts;
          for (const tx of newTxns) accounts = applyBalanceDelta(accounts, tx, 1);
          return {
            transactions: [...newTxns, ...state.transactions],
            accounts,
          };
        });
        return newTxns.length;
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
              reassignTransactionCategory(t, id, fallbackId),
            ),
            recurring: state.recurring.map((r) =>
              r.categoryId === id ? { ...r, categoryId: fallbackId } : r,
            ),
            loans: state.loans.map((l) =>
              l.categoryId === id ? { ...l, categoryId: fallbackId } : l,
            ),
            // A rule filing into a deleted category would keep firing and keep producing
            // "Unknown" rows — point it at the same catch-all everything else falls back to.
            rules: state.rules.map((r) =>
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
            rules: state.rules.map((r) =>
              r.labelIds.includes(id)
                ? { ...r, labelIds: r.labelIds.filter((lId) => lId !== id) }
                : r,
            ),
          };
        });
      },

      addBudget: (budgetData) => {
        const budget: Budget = {
          ...budgetData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        const scope = budgetScopeKey(budget);
        set((state) => ({
          // One limit per scope — a second budget for the same category, label, or "overall"
          // would double-count the same spending.
          budgets: [...state.budgets.filter((b) => budgetScopeKey(b) !== scope), budget],
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
          lastRunDate: ruleData.lastRunDate ?? null,
          occurrenceCount: 0,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ recurring: [...state.recurring, rule] }));
        return rule.id;
      },

      updateRecurring: (id, updates) => {
        set((state) => ({
          recurring: state.recurring.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      setRecurringPaused: (id, paused) => {
        set((state) => ({
          recurring: state.recurring.map((r) => {
            if (r.id !== id) return r;
            if (paused) return { ...r, pausedAt: new Date().toISOString() };
            // Drop the key rather than storing undefined, so a resumed rule serializes
            // identically to one that was never paused.
            const resumed = { ...r };
            delete resumed.pausedAt;
            return resumed;
          }),
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
        if (plan.occurrences.length === 0) return [];

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
          ...(rule.type === 'transfer' && rule.toAccountId
            ? { toAccountId: rule.toAccountId }
            : {}),
        }));

        set((s) => {
          let accounts = s.accounts;
          for (const tx of newTxns) accounts = applyBalanceDelta(accounts, tx, 1);

          // Auto-funding: a rule linked to a goal posts a matching contribution alongside its
          // transaction, so the goal's own ledger stays current without a manual entry each
          // time. Skipped if the goal has since been deleted — `deleteGoal` clears the link,
          // but a stale one from a backup restore must not resurrect a contribution to nothing.
          const goalIds = new Set(s.goals.map((g) => g.id));
          const newContributions: GoalContribution[] = plan.occurrences
            .filter(({ rule }) => rule.goalId && goalIds.has(rule.goalId))
            .map(({ rule, date }) => ({
              id: generateUUID(),
              goalId: rule.goalId as string,
              amount: rule.amount,
              date: date.toISOString(),
              note: rule.note,
              createdAt,
            }));

          return {
            transactions: [...newTxns, ...s.transactions],
            accounts,
            recurring: plan.rules,
            ...(newContributions.length > 0
              ? { goalContributions: [...newContributions, ...s.goalContributions] }
              : {}),
          };
        });

        return newTxns;
      },

      addTemplate: (templateData) => {
        const template: TransactionTemplate = {
          ...templateData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ templates: [...state.templates, template] }));
        return template.id;
      },

      deleteTemplate: (id) => {
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
      },

      addRule: (ruleData) => {
        const rule: CategoryRule = {
          ...ruleData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        // Appended, not prepended: a new rule must not silently outrank every existing one.
        set((state) => ({ rules: [...state.rules, rule] }));
        return rule.id;
      },

      updateRule: (id, updates) => {
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      deleteRule: (id) => {
        set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }));
      },

      moveRule: (id, direction) => {
        set((state) => {
          const index = state.rules.findIndex((r) => r.id === id);
          if (index === -1) return state;
          const target = direction === 'up' ? index - 1 : index + 1;
          if (target < 0 || target >= state.rules.length) return state;

          const rules = [...state.rules];
          [rules[index], rules[target]] = [rules[target], rules[index]];
          return { rules };
        });
      },

      applyRulesToExisting: (options) => {
        const state = get();
        const applications = planRuleApplication(state.transactions, state.rules, {
          restrictToCategoryId: options?.restrictToCategoryId,
        });
        if (applications.length === 0) return { changed: 0, previous: [] };

        const byId = new Map(applications.map((a) => [a.transactionId, a.after]));
        set((s) => ({
          transactions: s.transactions.map((t) => {
            const after = byId.get(t.id);
            return after ? { ...t, categoryId: after.categoryId, labels: after.labels } : t;
          }),
        }));

        return { changed: applications.length, previous: applications.map((a) => a.before) };
      },

      restoreCategorization: (rows) => {
        if (rows.length === 0) return;
        const byId = new Map(rows.map((row) => [row.id, row]));
        set((state) => ({
          transactions: state.transactions.map((t) => {
            const row = byId.get(t.id);
            if (!row) return t;
            const restored = { ...t, categoryId: row.categoryId, labels: row.labels };
            // Match how splits serialize elsewhere: absent rather than explicitly undefined.
            if (row.splits) restored.splits = row.splits;
            else delete restored.splits;
            return restored;
          }),
        }));
      },

      addGoal: (goalData) => {
        const goal: Goal = {
          ...goalData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ goals: [...state.goals, goal] }));
        return goal.id;
      },

      updateGoal: (id, updates) => {
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }));
      },

      deleteGoal: (id) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          goalContributions: state.goalContributions.filter((c) => c.goalId !== id),
          // The rule itself is still useful without the goal — drop the link rather than the
          // rule, same convention as clearing `Goal.linkedAccountId` when an account is deleted.
          recurring: state.recurring.map((r) => {
            if (r.goalId !== id) return r;
            const next = { ...r };
            delete next.goalId;
            return next;
          }),
        }));
      },

      addContribution: (contributionData) => {
        const contribution: GoalContribution = {
          ...contributionData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ goalContributions: [contribution, ...state.goalContributions] }));
        return contribution.id;
      },

      deleteContribution: (id) => {
        const contribution = get().goalContributions.find((c) => c.id === id);
        if (!contribution) return null;
        set((state) => ({
          goalContributions: state.goalContributions.filter((c) => c.id !== id),
        }));
        return contribution;
      },

      restoreContribution: (contribution) => {
        set((state) => {
          // Guard against a double undo re-inserting the same row twice.
          if (state.goalContributions.some((c) => c.id === contribution.id)) return state;
          return { goalContributions: [contribution, ...state.goalContributions] };
        });
      },

      addPerson: (personData) => {
        const person: Person = {
          ...personData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ people: [...state.people, person] }));
        return person.id;
      },

      updatePerson: (id, updates) => {
        set((state) => ({
          people: state.people.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      deletePerson: (id) => {
        set((state) => ({
          people: state.people.filter((p) => p.id !== id),
          debtEntries: state.debtEntries.filter((e) => e.personId !== id),
        }));
      },

      captureNetWorthSnapshots: () => {
        const state = get();
        const planned = planNetWorthSnapshots({
          accounts: state.accounts,
          transactions: state.transactions,
          snapshots: state.netWorthSnapshots,
          monthStartDay: normalizeMonthStartDay(state.settings.monthStartDay),
        });
        if (planned.length === 0) return 0;

        const createdAt = new Date().toISOString();
        const snapshots: NetWorthSnapshot[] = planned.map((snapshot) => ({
          ...snapshot,
          id: generateUUID(),
          createdAt,
        }));
        set((s) => ({
          netWorthSnapshots: dedupeSnapshotsByPeriod([...s.netWorthSnapshots, ...snapshots]),
        }));
        return snapshots.length;
      },

      addDebtEntry: (entryData) => {
        const entry: DebtEntry = {
          ...entryData,
          id: generateUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ debtEntries: [entry, ...state.debtEntries] }));
        return entry.id;
      },

      deleteDebtEntry: (id) => {
        const entry = get().debtEntries.find((e) => e.id === id);
        if (!entry) return null;
        set((state) => ({
          debtEntries: state.debtEntries.filter((e) => e.id !== id),
        }));
        return entry;
      },

      restoreDebtEntry: (entry) => {
        set((state) => {
          // Guard against a double undo re-inserting the same row twice.
          if (state.debtEntries.some((e) => e.id === entry.id)) return state;
          return { debtEntries: [entry, ...state.debtEntries] };
        });
      },

      addLoan: (loanData) => {
        const createdAt = new Date().toISOString();
        const emi = calculateEmi(loanData.principal, loanData.interestRate, loanData.tenureMonths);
        const recurring: RecurringTransaction = {
          id: generateUUID(),
          type: 'expense',
          amount: emi,
          accountId: loanData.accountId,
          categoryId: loanData.categoryId,
          note: `EMI — ${loanData.name}`,
          labels: [],
          frequency: 'monthly',
          startDate: loanData.startDate,
          // The term itself caps the EMI at origination; early payoff instead pauses it via
          // `setLoanClosed`, since prepayments aren't something a recurring rule knows about.
          maxOccurrences: loanData.tenureMonths,
          occurrenceCount: 0,
          lastRunDate: null,
          createdAt,
        };
        const loan: Loan = {
          ...loanData,
          id: generateUUID(),
          recurringId: recurring.id,
          createdAt,
        };
        set((state) => ({
          loans: [...state.loans, loan],
          recurring: [...state.recurring, recurring],
        }));
        return loan.id;
      },

      updateLoan: (id, updates) => {
        set((state) => {
          const target = state.loans.find((l) => l.id === id);
          if (!target) return state;
          const next = { ...target, ...updates };

          // The EMI is derived from principal/rate/tenure, never stored — keep the linked
          // recurring rule's amount and destination in step with whatever changed.
          const recurring = next.recurringId
            ? state.recurring.map((r) =>
                r.id === next.recurringId
                  ? {
                      ...r,
                      amount: calculateEmi(next.principal, next.interestRate, next.tenureMonths),
                      accountId: next.accountId,
                      categoryId: next.categoryId,
                      startDate: next.startDate,
                      note: `EMI — ${next.name}`,
                      maxOccurrences: next.tenureMonths,
                    }
                  : r,
              )
            : state.recurring;

          return {
            loans: state.loans.map((l) => (l.id === id ? next : l)),
            recurring,
          };
        });
      },

      setLoanClosed: (id, closed) => {
        set((state) => {
          const target = state.loans.find((l) => l.id === id);
          if (!target) return state;

          const loans = state.loans.map((l) => {
            if (l.id !== id) return l;
            if (closed) return { ...l, closedAt: new Date().toISOString() };
            if (!l.closedAt) return l;
            const reopened = { ...l };
            delete reopened.closedAt;
            return reopened;
          });

          const recurring = target.recurringId
            ? state.recurring.map((r) => {
                if (r.id !== target.recurringId) return r;
                if (closed) return { ...r, pausedAt: new Date().toISOString() };
                if (!r.pausedAt) return r;
                const resumed = { ...r };
                delete resumed.pausedAt;
                return resumed;
              })
            : state.recurring;

          return { loans, recurring };
        });
      },

      deleteLoan: (id) => {
        set((state) => {
          const target = state.loans.find((l) => l.id === id);
          return {
            loans: state.loans.filter((l) => l.id !== id),
            loanPrepayments: state.loanPrepayments.filter((p) => p.loanId !== id),
            recurring: target?.recurringId
              ? state.recurring.filter((r) => r.id !== target.recurringId)
              : state.recurring,
          };
        });
      },

      addLoanPrepayment: (prepaymentData) => {
        // The loan is the source of the account, category and name — trusted internal input,
        // like every other add* action assumes its foreign keys already resolve.
        const loan = get().loans.find((l) => l.id === prepaymentData.loanId)!;
        const createdAt = new Date().toISOString();
        const transaction: Transaction = {
          id: generateUUID(),
          type: 'expense',
          amount: prepaymentData.amount,
          accountId: loan.accountId,
          categoryId: loan.categoryId,
          date: prepaymentData.date,
          note: prepaymentData.note.trim() || `Prepayment — ${loan.name}`,
          labels: [],
          createdAt,
        };
        const prepayment: LoanPrepayment = {
          ...prepaymentData,
          id: generateUUID(),
          transactionId: transaction.id,
          createdAt,
        };
        set((state) => ({
          transactions: [transaction, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, transaction, 1),
          loanPrepayments: [prepayment, ...state.loanPrepayments],
        }));
        return prepayment.id;
      },

      deleteLoanPrepayment: (id) => {
        const prepayment = get().loanPrepayments.find((p) => p.id === id);
        if (!prepayment) return null;
        // Same convention as a settled debt entry: only the ledger row goes — the transaction
        // it created is real money that already moved, and stays in history.
        set((state) => ({
          loanPrepayments: state.loanPrepayments.filter((p) => p.id !== id),
        }));
        return prepayment;
      },

      restoreLoanPrepayment: (prepayment) => {
        set((state) => {
          // Guard against a double undo re-inserting the same row twice.
          if (state.loanPrepayments.some((p) => p.id === prepayment.id)) return state;
          return { loanPrepayments: [prepayment, ...state.loanPrepayments] };
        });
      },

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      resetToDefaults: () => {
        // Finance data only. Settings are preferences, not data — and wiping `onboardedAt`
        // would throw an existing user back into the first-run wizard with a blank name.
        set({
          accounts: [],
          transactions: [],
          categories: defaultCategories,
          labels: defaultLabels,
          budgets: [],
          recurring: [],
          templates: [],
          rules: [],
          goals: [],
          goalContributions: [],
          people: [],
          debtEntries: [],
          netWorthSnapshots: [],
          loans: [],
          loanPrepayments: [],
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
                  templates: mergeById(state.templates, data.templates),
                  rules: mergeById(state.rules, data.rules),
                  goals: mergeById(state.goals, data.goals),
                  goalContributions: mergeById(state.goalContributions, data.goalContributions),
                  people: mergeById(state.people, data.people),
                  debtEntries: mergeById(state.debtEntries, data.debtEntries),
                  netWorthSnapshots: mergeById(state.netWorthSnapshots, data.netWorthSnapshots),
                  loans: mergeById(state.loans, data.loans),
                  loanPrepayments: mergeById(state.loanPrepayments, data.loanPrepayments),
                }
              : {
                  accounts: (incomingAccounts ?? state.accounts) as ImportedAccount[],
                  transactions: data.transactions ?? state.transactions,
                  categories: data.categories ?? state.categories,
                  labels: data.labels ?? state.labels,
                  budgets: data.budgets ?? state.budgets,
                  recurring: data.recurring ?? state.recurring,
                  templates: data.templates ?? state.templates,
                  rules: data.rules ?? state.rules,
                  goals: data.goals ?? state.goals,
                  goalContributions: data.goalContributions ?? state.goalContributions,
                  people: data.people ?? state.people,
                  debtEntries: data.debtEntries ?? state.debtEntries,
                  netWorthSnapshots: data.netWorthSnapshots ?? state.netWorthSnapshots,
                  loans: data.loans ?? state.loans,
                  loanPrepayments: data.loanPrepayments ?? state.loanPrepayments,
                };

          return {
            ...next,
            // Ids are unique but period keys are the real identity — a merge of two devices'
            // backups can otherwise leave two competing snapshots for the same month.
            netWorthSnapshots: dedupeSnapshotsByPeriod(next.netWorthSnapshots),
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
      version: 15,
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

        if (version < 6) {
          // Anyone with persisted state has already been using the app, so the first-run
          // wizard must not appear for them — backdate it to their earliest known activity.
          const settings = (s.settings ?? {}) as Partial<Settings>;
          s = {
            ...s,
            settings: {
              ...defaultSettings,
              ...settings,
              onboardedAt: settings.onboardedAt ?? new Date().toISOString(),
            },
          };
        }

        if (version < 7) {
          // Budgets gained a period and rollover; recurring rules gained a lifecycle. Existing
          // rows keep behaving exactly as they did: monthly, no rollover, never paused, and a
          // zeroed occurrence tally (no limit was ever set, so nothing is counted against it).
          const settings = (s.settings ?? {}) as Partial<Settings>;
          s = {
            ...s,
            settings: {
              ...defaultSettings,
              ...settings,
              monthStartDay: normalizeMonthStartDay(settings.monthStartDay),
            },
            budgets: Array.isArray(s.budgets)
              ? s.budgets.map((b) => ({
                  ...b,
                  period: b.period ?? 'monthly',
                  rollover: b.rollover ?? false,
                }))
              : s.budgets,
            recurring: Array.isArray(s.recurring)
              ? s.recurring.map((r) => ({ ...r, occurrenceCount: r.occurrenceCount ?? 0 }))
              : s.recurring,
          };
        }

        if (version < 8) {
          // Templates are new; hideAmounts defaults to off so nobody's amounts vanish
          // out from under them on upgrade.
          const settings = (s.settings ?? {}) as Partial<Settings>;
          s = {
            ...s,
            settings: {
              ...defaultSettings,
              ...settings,
              hideAmounts: settings.hideAmounts ?? false,
            },
            templates: Array.isArray(s.templates) ? s.templates : [],
          };
        }

        if (version < 9) {
          // Savings goals are new.
          s = {
            ...s,
            goals: Array.isArray(s.goals) ? s.goals : [],
            goalContributions: Array.isArray(s.goalContributions) ? s.goalContributions : [],
          };
        }

        if (version < 10) {
          // Debt/lending tracker is new.
          s = {
            ...s,
            people: Array.isArray(s.people) ? s.people : [],
            debtEntries: Array.isArray(s.debtEntries) ? s.debtEntries : [],
          };
        }

        if (version < 11) {
          // Auto-categorization rules are new. Nobody gets seeded rules — an empty list means
          // nothing is silently recategorized on upgrade.
          s = {
            ...s,
            rules: Array.isArray(s.rules) ? s.rules : [],
          };
        }

        if (version < 12) {
          // Net-worth snapshots are new. Nothing is backfilled here: the first app start after
          // the upgrade calls `captureNetWorthSnapshots`, which reconstructs the recent months
          // from the transactions that are already stored.
          s = {
            ...s,
            netWorthSnapshots: Array.isArray(s.netWorthSnapshots) ? s.netWorthSnapshots : [],
          };
        }

        if (version < 13) {
          // Local reminders are new, and off: notification permission has to be asked for
          // behind a tap, so an upgrade cannot opt anyone in. The per-trigger switches default
          // on, so flipping the master switch alone gives useful reminders.
          const settings = (s.settings ?? {}) as Partial<Settings>;
          s = {
            ...s,
            settings: {
              ...defaultSettings,
              ...settings,
              notificationsEnabled: settings.notificationsEnabled ?? false,
              notifyBills: settings.notifyBills ?? true,
              notifyBudgets: settings.notifyBudgets ?? true,
              notifyCreditDue: settings.notifyCreditDue ?? true,
              notifyLeadDays: settings.notifyLeadDays ?? 2,
            },
          };
        }

        if (version < 14) {
          // Ten new default categories (Groceries, Insurance, Loan/EMI, Rent, Fitness &
          // Wellness, Pets, Childcare, Home Maintenance, Bonus, Dividends) were added after
          // the original set. Append the ones missing rather than reseeding the whole list,
          // so a user who deleted a v1 default doesn't get it silently restored.
          const existingIds = new Set(
            Array.isArray(s.categories) ? s.categories.map((c) => c.id) : [],
          );
          const missing = defaultCategories.filter(
            (c) => NEW_DEFAULT_CATEGORY_IDS.includes(c.id) && !existingIds.has(c.id),
          );
          s = {
            ...s,
            categories: Array.isArray(s.categories) ? [...s.categories, ...missing] : s.categories,
          };
        }

        if (version < 15) {
          // Loan/EMI tracking is new.
          s = {
            ...s,
            loans: Array.isArray(s.loans) ? s.loans : [],
            loanPrepayments: Array.isArray(s.loanPrepayments) ? s.loanPrepayments : [],
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
export const useTemplates = () => useFinanceStore((s) => s.templates);
export const useRules = () => useFinanceStore((s) => s.rules);
export const useGoals = () => useFinanceStore((s) => s.goals);
export const useGoalContributions = () => useFinanceStore((s) => s.goalContributions);
export const usePeople = () => useFinanceStore((s) => s.people);
export const useDebtEntries = () => useFinanceStore((s) => s.debtEntries);
export const useNetWorthSnapshots = () => useFinanceStore((s) => s.netWorthSnapshots);
export const useLoans = () => useFinanceStore((s) => s.loans);
export const useLoanPrepayments = () => useFinanceStore((s) => s.loanPrepayments);
export const useSettings = () => useFinanceStore((s) => s.settings);
