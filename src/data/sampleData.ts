import { addDays, subMonths } from 'date-fns';
import type {
  AccountType,
  Budget,
  BudgetPeriod,
  DebtEntry,
  Goal,
  GoalContribution,
  Person,
  RecurrenceFrequency,
  RecurringTransaction,
  Transaction,
  TransactionType,
} from '@/types';

/**
 * A hand-designed sample dataset offered in onboarding, so a new install doesn't start on a
 * totally empty screen — and doubles as a fixture for manual QA. Everything here is a plain,
 * cross-referenced spec rather than a real entity: accounts, goals and people don't have ids
 * yet (the store mints those), so transactions/budgets/recurring rules/contributions reference
 * them by a local `key` that `loadSampleData` resolves once each is actually created.
 *
 * Deliberately deterministic — no `Math.random()` — so the same `now` always produces the same
 * dataset, which is what makes this testable and makes a screenshot reproducible.
 */

export interface SampleAccountSpec {
  key: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  balance: number;
  creditLimit?: number;
  statementCloseDay?: number;
  paymentDueDays?: number;
}

export interface SampleTransactionSpec {
  type: TransactionType;
  amount: number;
  accountKey: string;
  toAccountKey?: string;
  categoryId: string;
  date: string;
  note: string;
  labels: string[];
}

export interface SampleBudgetSpec {
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  rollover: boolean;
}

export interface SampleRecurringSpec {
  type: TransactionType;
  amount: number;
  accountKey: string;
  toAccountKey?: string;
  categoryId: string;
  note: string;
  labels: string[];
  frequency: RecurrenceFrequency;
  startDate: string;
  goalKey?: string;
}

export interface SampleGoalSpec {
  key: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  targetDate?: string;
}

export interface SampleContributionSpec {
  goalKey: string;
  amount: number;
  date: string;
  note: string;
}

export interface SamplePersonSpec {
  key: string;
  name: string;
  icon: string;
  color: string;
}

export interface SampleDebtEntrySpec {
  personKey: string;
  amount: number;
  date: string;
  note: string;
}

export interface SampleData {
  accounts: SampleAccountSpec[];
  transactions: SampleTransactionSpec[];
  budgets: SampleBudgetSpec[];
  recurring: SampleRecurringSpec[];
  goals: SampleGoalSpec[];
  contributions: SampleContributionSpec[];
  people: SamplePersonSpec[];
  debtEntries: SampleDebtEntrySpec[];
}

const CHECKING = 'checking';
const SAVINGS = 'savings';
const CARD = 'card';
const VACATION_GOAL = 'vacation';
const EMERGENCY_GOAL = 'emergency';
const RAHUL = 'rahul';

/** Day-of-month offsets used to spread a category's charges across a sample month. */
const GROCERY_DAYS = [3, 10, 17, 24];
const FOOD_DAYS = [2, 6, 13, 20, 27];

function at(now: Date, monthsAgo: number, day: number, hour = 12): string {
  const base = subMonths(now, monthsAgo);
  return new Date(base.getFullYear(), base.getMonth(), day, hour).toISOString();
}

export function generateSampleData(now = new Date()): SampleData {
  const accounts: SampleAccountSpec[] = [
    { key: CHECKING, name: 'HDFC Checking', type: 'checking', color: '#6C63FF', icon: 'landmark', balance: 15000 },
    { key: SAVINGS, name: 'Savings', type: 'savings', color: '#22c55e', icon: 'piggy-bank', balance: 40000 },
    {
      key: CARD,
      name: 'Credit Card',
      type: 'credit',
      color: '#ef4444',
      icon: 'credit-card',
      balance: 0,
      creditLimit: 100000,
      statementCloseDay: 28,
      paymentDueDays: 18,
    },
  ];

  const transactions: SampleTransactionSpec[] = [];

  // Salary + freelance income, one of each per sample month.
  for (let m = 3; m >= 1; m -= 1) {
    transactions.push({
      type: 'income',
      amount: 65000,
      accountKey: CHECKING,
      categoryId: 'cat-9',
      date: at(now, m, 1),
      note: 'Monthly salary',
      labels: [],
    });
  }
  transactions.push({
    type: 'income',
    amount: 12000,
    accountKey: CHECKING,
    categoryId: 'cat-10',
    date: at(now, 2, 15),
    note: 'Freelance project',
    labels: [],
  });

  // Rent, paid from Checking, every sample month.
  for (let m = 3; m >= 1; m -= 1) {
    transactions.push({
      type: 'expense',
      amount: 15000,
      accountKey: CHECKING,
      categoryId: 'cat-8',
      date: at(now, m, 2),
      note: 'Monthly rent',
      labels: ['lbl-1'],
    });
  }

  // Groceries and everyday food, on Checking, spread across the month.
  const groceryAmounts = [1800, 2200, 1500, 2000];
  const foodAmounts = [350, 620, 480, 900, 275];
  for (let m = 3; m >= 1; m -= 1) {
    GROCERY_DAYS.forEach((day, i) => {
      transactions.push({
        type: 'expense',
        amount: groceryAmounts[i],
        accountKey: CHECKING,
        categoryId: 'cat-25',
        date: at(now, m, day),
        note: 'Groceries',
        labels: ['lbl-1'],
      });
    });
    FOOD_DAYS.forEach((day, i) => {
      transactions.push({
        type: 'expense',
        amount: foodAmounts[i],
        accountKey: CHECKING,
        categoryId: 'cat-1',
        date: at(now, m, day),
        note: i % 2 === 0 ? 'Lunch with friends' : 'Zomato order',
        labels: ['lbl-2'],
      });
    });
  }

  // Transport, on Checking.
  for (let m = 3; m >= 1; m -= 1) {
    transactions.push({
      type: 'expense',
      amount: 1200,
      accountKey: CHECKING,
      categoryId: 'cat-2',
      date: at(now, m, 8),
      note: 'Fuel',
      labels: [],
    });
    transactions.push({
      type: 'expense',
      amount: 450,
      accountKey: CHECKING,
      categoryId: 'cat-2',
      date: at(now, m, 22),
      note: 'Cab rides',
      labels: [],
    });
  }

  // Card spend: shopping, entertainment, and a recognisable recurring-looking subscription
  // (same note, same amount, monthly) — left uncovered by any recurring rule on purpose, so
  // the Insights feed offers to turn it into one.
  for (let m = 3; m >= 1; m -= 1) {
    transactions.push({
      type: 'expense',
      amount: 499,
      accountKey: CARD,
      categoryId: 'cat-18',
      date: at(now, m, 5),
      note: 'Netflix',
      labels: ['lbl-3'],
    });
    transactions.push({
      type: 'expense',
      amount: 1400,
      accountKey: CARD,
      categoryId: 'cat-3',
      date: at(now, m, 14),
      note: 'Online shopping',
      labels: ['lbl-2'],
    });
    transactions.push({
      type: 'expense',
      amount: 800,
      accountKey: CARD,
      categoryId: 'cat-4',
      date: at(now, m, 19),
      note: 'Movie night',
      labels: ['lbl-2'],
    });
  }

  // Utilities, paid from Checking.
  for (let m = 3; m >= 1; m -= 1) {
    transactions.push({
      type: 'expense',
      amount: 2200,
      accountKey: CHECKING,
      categoryId: 'cat-5',
      date: at(now, m, 12),
      note: 'Electricity bill',
      labels: ['lbl-1'],
    });
  }

  // Paying down the card from Checking, each sample month.
  for (let m = 2; m >= 1; m -= 1) {
    transactions.push({
      type: 'transfer',
      amount: 5000,
      accountKey: CHECKING,
      toAccountKey: CARD,
      categoryId: 'cat-13',
      date: at(now, m, 20),
      note: 'Credit card payment',
      labels: [],
    });
  }

  const budgets: SampleBudgetSpec[] = [
    { categoryId: '', amount: 40000, period: 'monthly', rollover: false },
    { categoryId: 'cat-1', amount: 8000, period: 'monthly', rollover: false },
    { categoryId: 'cat-3', amount: 3000, period: 'monthly', rollover: true },
  ];

  const goals: SampleGoalSpec[] = [
    {
      key: VACATION_GOAL,
      name: 'Vacation Fund',
      icon: 'plane',
      color: '#f59e0b',
      targetAmount: 60000,
      targetDate: addDays(now, 240).toISOString(),
    },
    {
      key: EMERGENCY_GOAL,
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 100000,
    },
  ];

  const contributions: SampleContributionSpec[] = [
    { goalKey: EMERGENCY_GOAL, amount: 20000, date: at(now, 2, 5), note: 'Starting balance' },
  ];

  // Rent going forward as a real rule (the last three rent transactions above are its
  // backfilled history), and a goal-linked transfer that auto-funds the Vacation Fund.
  const recurring: SampleRecurringSpec[] = [
    {
      type: 'expense',
      amount: 15000,
      accountKey: CHECKING,
      categoryId: 'cat-8',
      note: 'Monthly rent',
      labels: ['lbl-1'],
      frequency: 'monthly',
      startDate: at(now, 0, 2),
    },
    {
      type: 'transfer',
      amount: 3000,
      accountKey: CHECKING,
      toAccountKey: SAVINGS,
      categoryId: 'cat-13',
      note: 'Vacation savings',
      labels: [],
      frequency: 'monthly',
      startDate: at(now, 0, 25),
      goalKey: VACATION_GOAL,
    },
  ];

  const people: SamplePersonSpec[] = [
    { key: RAHUL, name: 'Rahul', icon: 'user', color: '#06b6d4' },
  ];

  const debtEntries: SampleDebtEntrySpec[] = [
    { personKey: RAHUL, amount: 1500, date: at(now, 1, 16), note: 'Lent for dinner' },
  ];

  return { accounts, transactions, budgets, recurring, goals, contributions, people, debtEntries };
}

/** The store actions `loadSampleData` needs — matches (a subset of) `FinanceStore`. */
export interface SampleDataActions {
  addAccount: (account: {
    name: string;
    type: AccountType;
    color: string;
    icon: string;
    balance: number;
    creditLimit?: number;
    statementCloseDay?: number;
    paymentDueDays?: number;
  }) => string;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => string;
  addPerson: (person: Omit<Person, 'id' | 'createdAt'>) => string;
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => void;
  addRecurring: (
    rule: Omit<RecurringTransaction, 'id' | 'createdAt' | 'occurrenceCount' | 'lastRunDate'>,
  ) => string;
  addContribution: (contribution: Omit<GoalContribution, 'id' | 'createdAt'>) => string;
  addDebtEntry: (entry: Omit<DebtEntry, 'id' | 'createdAt'>) => string;
  bulkAddTransactions: (transactions: Omit<Transaction, 'id' | 'createdAt'>[]) => number;
}

/**
 * Applies `generateSampleData()` through the store's own actions — same code path a manual
 * entry would go through, so balances, budgets and the recurring schedule all end up exactly
 * as consistent as if a user had typed all of this in by hand.
 */
export function loadSampleData(actions: SampleDataActions, now = new Date()): void {
  const data = generateSampleData(now);

  const accountIds = new Map(
    data.accounts.map((a) => [
      a.key,
      actions.addAccount({
        name: a.name,
        type: a.type,
        color: a.color,
        icon: a.icon,
        balance: a.balance,
        ...(a.creditLimit !== undefined ? { creditLimit: a.creditLimit } : {}),
        ...(a.statementCloseDay !== undefined ? { statementCloseDay: a.statementCloseDay } : {}),
        ...(a.paymentDueDays !== undefined ? { paymentDueDays: a.paymentDueDays } : {}),
      }),
    ]),
  );
  const resolveAccount = (key: string): string => {
    const id = accountIds.get(key);
    if (!id) throw new Error(`Sample data referenced an unknown account key "${key}"`);
    return id;
  };

  const goalIds = new Map(
    data.goals.map((g) => [
      g.key,
      actions.addGoal({
        name: g.name,
        icon: g.icon,
        color: g.color,
        targetAmount: g.targetAmount,
        ...(g.targetDate ? { targetDate: g.targetDate } : {}),
      }),
    ]),
  );

  const personIds = new Map(
    data.people.map((p) => [p.key, actions.addPerson({ name: p.name, icon: p.icon, color: p.color })]),
  );

  for (const budget of data.budgets) actions.addBudget(budget);

  for (const rule of data.recurring) {
    actions.addRecurring({
      type: rule.type,
      amount: rule.amount,
      accountId: resolveAccount(rule.accountKey),
      categoryId: rule.categoryId,
      note: rule.note,
      labels: rule.labels,
      frequency: rule.frequency,
      startDate: rule.startDate,
      ...(rule.toAccountKey ? { toAccountId: resolveAccount(rule.toAccountKey) } : {}),
      ...(rule.goalKey ? { goalId: goalIds.get(rule.goalKey) } : {}),
    });
  }

  for (const contribution of data.contributions) {
    const goalId = goalIds.get(contribution.goalKey);
    if (!goalId) continue;
    actions.addContribution({
      goalId,
      amount: contribution.amount,
      date: contribution.date,
      note: contribution.note,
    });
  }

  for (const entry of data.debtEntries) {
    const personId = personIds.get(entry.personKey);
    if (!personId) continue;
    actions.addDebtEntry({
      personId,
      amount: entry.amount,
      date: entry.date,
      note: entry.note,
    });
  }

  actions.bulkAddTransactions(
    data.transactions.map((t) => ({
      type: t.type,
      amount: t.amount,
      accountId: resolveAccount(t.accountKey),
      categoryId: t.categoryId,
      date: t.date,
      note: t.note,
      labels: t.labels,
      ...(t.toAccountKey ? { toAccountId: resolveAccount(t.toAccountKey) } : {}),
    })),
  );
}
