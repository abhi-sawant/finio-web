import { describe, expect, it, vi } from 'vitest';
import {
  buildSearchIndex,
  budgetHealth,
  budgetScopeKey,
  BUDGET_NEAR_LIMIT_PERCENT,
  computeBudgetHistory,
  computeBudgetStatuses,
  computeGoalStatus,
  computePersonBalance,
  getCreditCardDueInfo,
  getCreditUtilization,
  getCurrentMonthTransactions,
  getDashboardStats,
  getTotalOwedToYou,
  getTotalYouOwe,
  transactionCategoryAmounts,
  transactionMatchesQuery,
  transactionsToCsv,
} from './calculations';
import type {
  Account,
  Budget,
  Category,
  DebtEntry,
  Goal,
  GoalContribution,
  Label,
  Person,
  Transaction,
} from '@/types';

function creditAccount(partial: Partial<Account> = {}): Account {
  return {
    id: 'acc-credit',
    name: 'Visa',
    type: 'credit',
    color: '#000',
    icon: 'credit-card',
    balance: -1000,
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    creditLimit: 10000,
    ...partial,
  };
}

function tx(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  return {
    id: partial.id ?? `tx-${partial.type}-${partial.amount}`,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    date: '2026-06-05T00:00:00.000Z',
    note: '',
    labels: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    ...partial,
  };
}

function goal(extra: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Emergency Fund',
    icon: 'target',
    color: '#6C63FF',
    targetAmount: 10000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function contribution(
  partial: Partial<GoalContribution> & Pick<GoalContribution, 'amount'>,
): GoalContribution {
  return {
    id: partial.id ?? `contrib-${partial.amount}`,
    goalId: 'goal-1',
    date: '2026-01-05T00:00:00.000Z',
    note: '',
    createdAt: '2026-01-05T00:00:00.000Z',
    ...partial,
  };
}

function person(extra: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    name: 'Rahul',
    icon: 'user',
    color: '#6C63FF',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function debtEntry(partial: Partial<DebtEntry> & Pick<DebtEntry, 'amount'>): DebtEntry {
  return {
    id: partial.id ?? `entry-${partial.amount}`,
    personId: 'person-1',
    date: '2026-01-05T00:00:00.000Z',
    note: '',
    createdAt: '2026-01-05T00:00:00.000Z',
    ...partial,
  };
}

function budget(categoryId: string, amount: number, extra: Partial<Budget> = {}): Budget {
  return {
    id: `b-${categoryId}`,
    categoryId,
    amount,
    period: 'monthly',
    rollover: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/** Local-time helpers: period boundaries are local, so fixtures must be too. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const on = (y: number, m: number, d: number) => at(y, m, d, 10).toISOString();

/** June 2026, comfortably inside the month in any timezone. */
const IN_JUNE = { now: at(2026, 6, 15) };

const categories: Category[] = [
  { id: 'cat-1', name: 'Food', icon: 'utensils', color: '#ef4444', type: 'expense' },
  { id: 'cat-2', name: 'Transport', icon: 'car', color: '#f97316', type: 'expense' },
];

describe('transactionCategoryAmounts', () => {
  it('returns a single entry for an unsplit transaction', () => {
    const t = tx({ type: 'expense', amount: 500, categoryId: 'cat-1' });
    expect(transactionCategoryAmounts(t)).toEqual([{ categoryId: 'cat-1', amount: 500 }]);
  });

  it('returns the splits verbatim when present', () => {
    const t = tx({
      type: 'expense',
      amount: 500,
      categoryId: '',
      splits: [
        { categoryId: 'cat-1', amount: 300 },
        { categoryId: 'cat-2', amount: 200 },
      ],
    });
    expect(transactionCategoryAmounts(t)).toEqual([
      { categoryId: 'cat-1', amount: 300 },
      { categoryId: 'cat-2', amount: 200 },
    ]);
  });
});

describe('computeBudgetStatuses', () => {
  const monthTxns = [
    tx({ type: 'expense', amount: 300, categoryId: 'cat-1' }),
    tx({ type: 'expense', amount: 200, categoryId: 'cat-1', id: 'tx-2' }),
    tx({ type: 'expense', amount: 100, categoryId: 'cat-2' }),
    tx({ type: 'income', amount: 5000, categoryId: 'cat-9' }),
    tx({ type: 'transfer', amount: 900, toAccountId: 'acc-2' }),
  ];

  it('sums spending per category and ignores income and transfers', () => {
    const [food] = computeBudgetStatuses([budget('cat-1', 1000)], monthTxns, IN_JUNE);
    expect(food.spent).toBe(500);
    expect(food.remaining).toBe(500);
    expect(food.percent).toBe(50);
    expect(food.isOver).toBe(false);
  });

  it('treats an empty categoryId as the overall budget across all expenses', () => {
    const [overall] = computeBudgetStatuses([budget('', 1000)], monthTxns, IN_JUNE);
    expect(overall.spent).toBe(600);
  });

  it('flags an exceeded budget and reports negative remaining', () => {
    const [tight] = computeBudgetStatuses([budget('cat-1', 400)], monthTxns, IN_JUNE);
    expect(tight.isOver).toBe(true);
    expect(tight.remaining).toBe(-100);
    expect(tight.percent).toBe(125);
  });

  it('does not report over-budget when spending exactly matches the limit', () => {
    const [exact] = computeBudgetStatuses([budget('cat-1', 500)], monthTxns, IN_JUNE);
    expect(exact.isOver).toBe(false);
    expect(exact.percent).toBe(100);
  });

  it('reports zero percent instead of Infinity for a zero-amount budget', () => {
    const [zero] = computeBudgetStatuses([budget('cat-1', 0)], monthTxns, IN_JUNE);
    expect(zero.percent).toBe(0);
  });

  it('reports zero spend for a category with no transactions', () => {
    const [unused] = computeBudgetStatuses([budget('cat-99', 500)], monthTxns, IN_JUNE);
    expect(unused.spent).toBe(0);
    expect(unused.remaining).toBe(500);
  });
});

describe('budgetHealth', () => {
  it('calls an exceeded budget over, whatever the percentage', () => {
    expect(budgetHealth({ isOver: true, percent: 101 })).toBe('over');
    // Rollover debt can push a budget over its limit while percent stays modest.
    expect(budgetHealth({ isOver: true, percent: 40 })).toBe('over');
  });

  it('warns from the near-limit threshold up, and not below it', () => {
    expect(budgetHealth({ isOver: false, percent: BUDGET_NEAR_LIMIT_PERCENT })).toBe('near');
    expect(budgetHealth({ isOver: false, percent: BUDGET_NEAR_LIMIT_PERCENT - 0.1 })).toBe('ok');
  });

  it('treats a fully-spent-but-not-over budget as near, not over', () => {
    expect(budgetHealth({ isOver: false, percent: 100 })).toBe('near');
  });

  it('agrees with computeBudgetStatuses on a real budget', () => {
    const txns = [tx({ type: 'expense', amount: 500, categoryId: 'cat-1' })];

    const [tight] = computeBudgetStatuses([budget('cat-1', 400)], txns, IN_JUNE);
    expect(budgetHealth(tight)).toBe('over');

    const [roomy] = computeBudgetStatuses([budget('cat-1', 1000)], txns, IN_JUNE);
    expect(budgetHealth(roomy)).toBe('ok');
  });
});

describe('transactionMatchesQuery', () => {
  const accounts: Account[] = [
    {
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      color: '#000',
      icon: 'landmark',
      balance: 0,
      openingBalance: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'acc-2',
      name: 'Cash Wallet',
      type: 'cash',
      color: '#000',
      icon: 'wallet',
      balance: 0,
      openingBalance: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const labels: Label[] = [
    { id: 'lbl-1', name: 'Essential', color: '#22c55e' },
    { id: 'lbl-2', name: 'Discretionary', color: '#f59e0b' },
  ];
  const index = buildSearchIndex(categories, accounts, labels);

  const groceries = tx({
    type: 'expense',
    amount: 1200.5,
    note: 'Weekly groceries',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    labels: ['lbl-1'],
  });
  const transfer = tx({
    type: 'transfer',
    amount: 500,
    accountId: 'acc-1',
    toAccountId: 'acc-2',
    note: '',
  });

  it('matches an empty query against everything', () => {
    expect(transactionMatchesQuery(groceries, '   ', index)).toBe(true);
  });

  it('matches the note case-insensitively', () => {
    expect(transactionMatchesQuery(groceries, 'GROCER', index)).toBe(true);
  });

  it('matches the category name', () => {
    expect(transactionMatchesQuery(groceries, 'food', index)).toBe(true);
  });

  it('matches the source account name', () => {
    expect(transactionMatchesQuery(groceries, 'hdfc', index)).toBe(true);
  });

  it('matches the destination account of a transfer', () => {
    expect(transactionMatchesQuery(transfer, 'cash wallet', index)).toBe(true);
  });

  it("matches a split's category name", () => {
    const split = tx({
      type: 'expense',
      amount: 500,
      categoryId: '',
      splits: [
        { categoryId: 'cat-1', amount: 300 },
        { categoryId: 'cat-2', amount: 200 },
      ],
    });
    expect(transactionMatchesQuery(split, 'transport', index)).toBe(true);
    expect(transactionMatchesQuery(split, 'zzz', index)).toBe(false);
  });

  it('matches a label name', () => {
    expect(transactionMatchesQuery(groceries, 'essential', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, 'discretionary', index)).toBe(false);
  });

  it('matches the amount, ignoring grouping and currency symbols', () => {
    expect(transactionMatchesQuery(groceries, '1200', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, '₹1,200', index)).toBe(true);
    expect(transactionMatchesQuery(groceries, '1200.5', index)).toBe(true);
  });

  it('does not treat a bare separator as an amount match', () => {
    expect(transactionMatchesQuery(transfer, '.', index)).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(transactionMatchesQuery(groceries, 'zzz', index)).toBe(false);
  });
});

describe('getDashboardStats', () => {
  it('reports a negative savings rate when spending exceeds income', () => {
    const stats = getDashboardStats(
      [tx({ type: 'income', amount: 1000 }), tx({ type: 'expense', amount: 1500 })],
      [],
      categories,
    );
    expect(stats.savingsRate).toBeCloseTo(-0.5);
  });

  it('reports a zero savings rate when there is no income to divide by', () => {
    const stats = getDashboardStats([tx({ type: 'expense', amount: 500 })], [], categories);
    expect(stats.savingsRate).toBe(0);
  });

  it('picks the biggest expense and the top category', () => {
    const stats = getDashboardStats(
      [
        tx({ type: 'expense', amount: 100, categoryId: 'cat-1', id: 'a' }),
        tx({ type: 'expense', amount: 400, categoryId: 'cat-2', id: 'b' }),
        tx({ type: 'expense', amount: 250, categoryId: 'cat-1', id: 'c' }),
      ],
      [],
      categories,
    );
    expect(stats.biggestExpense?.id).toBe('b');
    expect(stats.topCategory?.category.id).toBe('cat-2');
    expect(stats.topCategory?.amount).toBe(400);
  });

  it('computes month-over-month change against the previous month', () => {
    const stats = getDashboardStats(
      [tx({ type: 'expense', amount: 1200 })],
      [tx({ type: 'expense', amount: 1000, id: 'prev' })],
      categories,
    );
    expect(stats.monthOverMonthChange).toBeCloseTo(0.2);
  });

  it('paces the daily average over the cycle, not the calendar month', () => {
    const spend = [tx({ type: 'expense', amount: 1000, date: on(2026, 7, 2) })];
    // 4 Jul: four days into the calendar month, but ten into a 25th-start cycle.
    const calendar = getDashboardStats(spend, [], categories, { now: at(2026, 7, 4) });
    const cycle = getDashboardStats(spend, [], categories, {
      now: at(2026, 7, 4),
      monthStartDay: 25,
    });

    expect(calendar.dailyAverage).toBe(250);
    expect(cycle.dailyAverage).toBe(100);
  });

  it('distributes a split expense across its categories', () => {
    const stats = getDashboardStats(
      [
        tx({
          type: 'expense',
          amount: 500,
          categoryId: '',
          splits: [
            { categoryId: 'cat-1', amount: 300 },
            { categoryId: 'cat-2', amount: 200 },
          ],
        }),
        tx({ type: 'expense', amount: 100, categoryId: 'cat-2', id: 'b' }),
      ],
      [],
      categories,
    );
    expect(stats.topCategory?.category.id).toBe('cat-1');
    expect(stats.topCategory?.amount).toBe(300);
  });
});

describe('transactionsToCsv', () => {
  const accounts: Account[] = [
    {
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      color: '#000',
      icon: 'landmark',
      balance: 0,
      openingBalance: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('exports a plain transaction with an empty split detail column', () => {
    const csv = transactionsToCsv([tx({ type: 'expense', amount: 500 })], categories, accounts);
    const [header, row] = csv.split('\n');
    expect(header).toBe('Date,Type,Amount,Account,To Account,Category,Note,Split Detail');
    expect(row.endsWith(',""')).toBe(true);
    expect(row).toContain('"Food"');
  });

  it('summarizes a split transaction without double-counting the amount', () => {
    const csv = transactionsToCsv(
      [
        tx({
          type: 'expense',
          amount: 500,
          categoryId: '',
          splits: [
            { categoryId: 'cat-1', amount: 300 },
            { categoryId: 'cat-2', amount: 200 },
          ],
        }),
      ],
      categories,
      accounts,
    );
    const [, row] = csv.split('\n');
    expect(row).toContain('500');
    expect(row).toContain('"Split (2)"');
    expect(row).toContain('"Food: 300.00 | Transport: 200.00"');
  });
});

describe('budget scopes', () => {
  const inJuly = { now: at(2026, 7, 15) };

  it('keeps overall, category and label budgets in distinct scopes', () => {
    expect(budgetScopeKey({ categoryId: '' })).not.toBe(budgetScopeKey({ categoryId: 'cat-1' }));
    expect(budgetScopeKey({ categoryId: '', labelId: 'lbl-1' })).not.toBe(
      budgetScopeKey({ categoryId: '' }),
    );
    // A label budget's categoryId is irrelevant — the label is what identifies it.
    expect(budgetScopeKey({ categoryId: 'cat-1', labelId: 'lbl-1' })).toBe(
      budgetScopeKey({ categoryId: '', labelId: 'lbl-1' }),
    );
  });

  it('sums a label budget across categories', () => {
    const txns = [
      tx({ type: 'expense', amount: 300, id: 'a', date: on(2026, 7, 3), labels: ['lbl-1'] }),
      tx({
        type: 'expense',
        amount: 200,
        id: 'b',
        date: on(2026, 7, 4),
        categoryId: 'cat-2',
        labels: ['lbl-1', 'lbl-2'],
      }),
      tx({ type: 'expense', amount: 900, id: 'c', date: on(2026, 7, 5), labels: ['lbl-2'] }),
    ];

    const [status] = computeBudgetStatuses([budget('', 1000, { labelId: 'lbl-1' })], txns, inJuly);
    expect(status.spent).toBe(500);
  });

  it('counts only the current week for a weekly budget', () => {
    const txns = [
      // 13–19 Jul 2026 is the week containing the 15th.
      tx({ type: 'expense', amount: 400, id: 'in', date: on(2026, 7, 14) }),
      tx({ type: 'expense', amount: 700, id: 'out', date: on(2026, 7, 10) }),
    ];

    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { period: 'weekly' })],
      txns,
      inJuly,
    );
    expect(status.spent).toBe(400);
    expect(status.range.start).toEqual(new Date(2026, 6, 13));
  });

  it('follows the custom month start day', () => {
    const txns = [
      // 26 Jun belongs to the 25 Jun – 24 Jul cycle, not to June.
      tx({ type: 'expense', amount: 250, id: 'cycle', date: on(2026, 6, 26) }),
      tx({ type: 'expense', amount: 800, id: 'before', date: on(2026, 6, 20) }),
    ];

    const [status] = computeBudgetStatuses([budget('cat-1', 1000)], txns, {
      now: at(2026, 7, 10),
      monthStartDay: 25,
    });
    expect(status.spent).toBe(250);
    expect(status.range.start).toEqual(new Date(2026, 5, 25));
  });

  describe('with a split expense', () => {
    const splitTx = tx({
      type: 'expense',
      amount: 500,
      id: 'split',
      categoryId: '',
      date: on(2026, 7, 5),
      labels: ['lbl-1'],
      splits: [
        { categoryId: 'cat-1', amount: 300 },
        { categoryId: 'cat-2', amount: 200 },
      ],
    });

    it('counts only the matching portion toward a category budget', () => {
      const [food] = computeBudgetStatuses([budget('cat-1', 1000)], [splitTx], inJuly);
      expect(food.spent).toBe(300);
      const [transport] = computeBudgetStatuses([budget('cat-2', 1000)], [splitTx], inJuly);
      expect(transport.spent).toBe(200);
    });

    it('counts the full amount toward an overall budget', () => {
      const [overall] = computeBudgetStatuses([budget('', 1000)], [splitTx], inJuly);
      expect(overall.spent).toBe(500);
    });

    it('counts the full amount toward a matching label budget', () => {
      const [status] = computeBudgetStatuses(
        [budget('', 1000, { labelId: 'lbl-1' })],
        [splitTx],
        inJuly,
      );
      expect(status.spent).toBe(500);
    });
  });
});

describe('budget rollover', () => {
  const inJuly = { now: at(2026, 7, 15) };
  const juneSpend = (amount: number) => [
    tx({ type: 'expense', amount, id: 'june', date: on(2026, 6, 10) }),
  ];
  const created = new Date(2026, 5, 1).toISOString();

  it('carries unspent budget into the current period', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { rollover: true, createdAt: created })],
      juneSpend(400),
      inJuly,
    );
    expect(status.carryover).toBe(600);
    expect(status.limit).toBe(1600);
    expect(status.remaining).toBe(1600);
  });

  it('carries an overspend forward as a debt', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { rollover: true, createdAt: created })],
      juneSpend(1300),
      inJuly,
    );
    expect(status.carryover).toBe(-300);
    expect(status.limit).toBe(700);
  });

  it('starts every period fresh when rollover is off', () => {
    const [status] = computeBudgetStatuses(
      [budget('cat-1', 1000, { createdAt: created })],
      juneSpend(400),
      inJuly,
    );
    expect(status.carryover).toBe(0);
    expect(status.limit).toBe(1000);
  });

  it('never reaches back past the period the budget was created in', () => {
    const [status] = computeBudgetStatuses(
      // Created this period, so there is nothing to roll over yet.
      [budget('cat-1', 1000, { rollover: true, createdAt: new Date(2026, 6, 2).toISOString() })],
      juneSpend(0),
      inJuly,
    );
    expect(status.carryover).toBe(0);
  });
});

describe('computeBudgetHistory', () => {
  it('reports completed periods most recent first', () => {
    const txns = [
      tx({ type: 'expense', amount: 400, id: 'may', date: on(2026, 5, 10) }),
      tx({ type: 'expense', amount: 1200, id: 'jun', date: on(2026, 6, 10) }),
      tx({ type: 'expense', amount: 50, id: 'jul', date: on(2026, 7, 10) }),
    ];

    const history = computeBudgetHistory(
      budget('cat-1', 1000, { createdAt: new Date(2026, 4, 1).toISOString() }),
      txns,
      { now: at(2026, 7, 15) },
    );

    // The in-progress period is not history.
    expect(history).toHaveLength(2);
    expect(history[0].spent).toBe(1200);
    expect(history[0].isOver).toBe(true);
    expect(history[1].spent).toBe(400);
    expect(history[1].isOver).toBe(false);
  });

  it('reflects rolled-over limits in past periods', () => {
    const txns = [tx({ type: 'expense', amount: 400, id: 'may', date: on(2026, 5, 10) })];
    const [june] = computeBudgetHistory(
      budget('cat-1', 1000, { rollover: true, createdAt: new Date(2026, 4, 1).toISOString() }),
      txns,
      { now: at(2026, 7, 15) },
    );
    // June inherited May's unspent 600.
    expect(june.limit).toBe(1600);
    expect(june.spent).toBe(0);
  });
});

describe('getCurrentMonthTransactions', () => {
  it('uses the salary cycle rather than the calendar month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 7, 10));
    try {
      const txns = [
        tx({ type: 'expense', amount: 100, id: 'cycle', date: on(2026, 6, 26) }),
        tx({ type: 'expense', amount: 100, id: 'before', date: on(2026, 6, 20) }),
      ];
      expect(getCurrentMonthTransactions(txns).map((t) => t.id)).toEqual([]);
      expect(getCurrentMonthTransactions(txns, 25).map((t) => t.id)).toEqual(['cycle']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getCreditUtilization', () => {
  it('is zero for a non-credit account', () => {
    expect(getCreditUtilization(creditAccount({ type: 'savings' }))).toBe(0);
  });

  it('is zero for a credit account with no limit set', () => {
    expect(getCreditUtilization(creditAccount({ creditLimit: undefined }))).toBe(0);
  });

  it('is the outstanding balance over the limit', () => {
    expect(getCreditUtilization(creditAccount({ balance: -2500, creditLimit: 10000 }))).toBe(0.25);
  });

  it('ignores a positive (in-credit) balance', () => {
    expect(getCreditUtilization(creditAccount({ balance: 500 }))).toBe(0);
  });
});

describe('getCreditCardDueInfo', () => {
  it('is null for a non-credit account', () => {
    expect(getCreditCardDueInfo(creditAccount({ type: 'checking' }))).toBeNull();
  });

  it('is null without a statement cycle configured', () => {
    expect(getCreditCardDueInfo(creditAccount())).toBeNull();
  });

  it('is null for an archived account', () => {
    const account = creditAccount({
      statementCloseDay: 5,
      paymentDueDays: 20,
      archivedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(getCreditCardDueInfo(account)).toBeNull();
  });

  it('is null when nothing is outstanding', () => {
    const account = creditAccount({ balance: 0, statementCloseDay: 5, paymentDueDays: 20 });
    expect(getCreditCardDueInfo(account)).toBeNull();
  });

  it("anchors to this month's close day once it has passed", () => {
    const account = creditAccount({ balance: -1000, statementCloseDay: 5, paymentDueDays: 20 });
    const info = getCreditCardDueInfo(account, at(2026, 7, 10));
    expect(info?.dueDate).toEqual(at(2026, 7, 25, 0));
    expect(info?.daysUntilDue).toBe(15);
    expect(info?.isOverdue).toBe(false);
  });

  it("falls back to last month's close day before this month's has arrived", () => {
    const account = creditAccount({ balance: -1000, statementCloseDay: 5, paymentDueDays: 20 });
    const info = getCreditCardDueInfo(account, at(2026, 7, 3));
    expect(info?.dueDate).toEqual(at(2026, 6, 25, 0));
    expect(info?.isOverdue).toBe(true);
    expect(info?.daysUntilDue).toBeLessThan(0);
  });

  it('defaults the minimum due to 5% of the outstanding balance', () => {
    const account = creditAccount({ balance: -1000, statementCloseDay: 5, paymentDueDays: 20 });
    const info = getCreditCardDueInfo(account, at(2026, 7, 10));
    expect(info?.minimumDue).toBe(50);
  });

  it('honours a configured minimum due percent', () => {
    const account = creditAccount({
      balance: -1000,
      statementCloseDay: 5,
      paymentDueDays: 20,
      minimumDuePercent: 10,
    });
    const info = getCreditCardDueInfo(account, at(2026, 7, 10));
    expect(info?.minimumDue).toBe(100);
  });
});

describe('computeGoalStatus', () => {
  it('sums only the contributions logged against this goal', () => {
    const g = goal({ targetAmount: 10000 });
    const contributions = [
      contribution({ id: 'c1', amount: 2000 }),
      contribution({ id: 'c2', amount: 1000 }),
      contribution({ id: 'c3', amount: 500, goalId: 'other-goal' }),
    ];
    const status = computeGoalStatus(g, contributions, at(2026, 1, 10));
    expect(status.current).toBe(3000);
    expect(status.remaining).toBe(7000);
    expect(status.percent).toBe(30);
    expect(status.isComplete).toBe(false);
  });

  it('nets withdrawals (negative amounts) against contributions', () => {
    const g = goal({ targetAmount: 10000 });
    const contributions = [
      contribution({ id: 'c1', amount: 3000 }),
      contribution({ id: 'c2', amount: -1000 }),
    ];
    const status = computeGoalStatus(g, contributions, at(2026, 1, 10));
    expect(status.current).toBe(2000);
  });

  it('is complete once contributions reach the target, and percent can exceed 100', () => {
    const g = goal({ targetAmount: 1000 });
    const contributions = [contribution({ amount: 1200 })];
    const status = computeGoalStatus(g, contributions, at(2026, 1, 10));
    expect(status.isComplete).toBe(true);
    expect(status.remaining).toBe(-200);
    expect(status.percent).toBe(120);
  });

  it('has no projected date with zero contributions', () => {
    const g = goal({ targetAmount: 10000 });
    const status = computeGoalStatus(g, [], at(2026, 1, 10));
    expect(status.projectedDate).toBeNull();
  });

  it('has no projected date once the goal is already complete', () => {
    const g = goal({ targetAmount: 1000 });
    const contributions = [contribution({ amount: 1000 })];
    const status = computeGoalStatus(g, contributions, at(2026, 1, 10));
    expect(status.projectedDate).toBeNull();
  });

  it('has no projected date when net progress is zero or negative', () => {
    const g = goal({ targetAmount: 10000, createdAt: '2026-01-01T00:00:00.000Z' });
    const contributions = [
      contribution({ id: 'c1', amount: 1000 }),
      contribution({ id: 'c2', amount: -1000 }),
    ];
    const status = computeGoalStatus(g, contributions, at(2026, 1, 31));
    expect(status.projectedDate).toBeNull();
  });

  it('projects completion by pacing the average daily contribution since creation', () => {
    // Created 30 days before `now`, ₹1,000 saved so far toward a ₹10,000 target — a daily
    // pace of ~33.33, needing ~270 more days to close the ₹9,000 gap.
    const g = goal({ targetAmount: 10000, createdAt: '2026-01-01T00:00:00.000Z' });
    const contributions = [contribution({ amount: 1000, date: '2026-01-01T00:00:00.000Z' })];
    const now = at(2026, 1, 31);
    const status = computeGoalStatus(g, contributions, now);
    expect(status.projectedDate).not.toBeNull();
    const daysAhead = Math.round(
      (status.projectedDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(daysAhead).toBe(270);
  });
});

describe('computePersonBalance', () => {
  it('sums only the entries logged against this person', () => {
    const p = person();
    const entries = [
      debtEntry({ id: 'e1', amount: 500 }),
      debtEntry({ id: 'e2', amount: 200 }),
      debtEntry({ id: 'e3', amount: 100, personId: 'someone-else' }),
    ];
    const status = computePersonBalance(p, entries);
    expect(status.balance).toBe(700);
  });

  it('nets negative entries (you owe them) against positive ones (they owe you)', () => {
    const p = person();
    const entries = [debtEntry({ id: 'e1', amount: 1000 }), debtEntry({ id: 'e2', amount: -400 })];
    const status = computePersonBalance(p, entries);
    expect(status.balance).toBe(600);
  });

  it('reports zero balance and null last activity with no entries', () => {
    const status = computePersonBalance(person(), []);
    expect(status.balance).toBe(0);
    expect(status.lastActivity).toBeNull();
  });

  it('reports the most recent entry date as last activity', () => {
    const entries = [
      debtEntry({ id: 'e1', amount: 100, date: '2026-01-05T00:00:00.000Z' }),
      debtEntry({ id: 'e2', amount: 100, date: '2026-02-10T00:00:00.000Z' }),
      debtEntry({ id: 'e3', amount: 100, date: '2026-01-20T00:00:00.000Z' }),
    ];
    const status = computePersonBalance(person(), entries);
    expect(status.lastActivity).toBe('2026-02-10T00:00:00.000Z');
  });
});

describe('getTotalOwedToYou / getTotalYouOwe', () => {
  it('sums positive balances as owed-to-you and negative balances (as positive) as you-owe', () => {
    const people = [
      person({ id: 'p1', name: 'Rahul' }),
      person({ id: 'p2', name: 'Priya' }),
      person({ id: 'p3', name: 'Settled' }),
    ];
    const entries = [
      debtEntry({ id: 'e1', personId: 'p1', amount: 1000 }),
      debtEntry({ id: 'e2', personId: 'p2', amount: -400 }),
      debtEntry({ id: 'e3', personId: 'p3', amount: 200 }),
      debtEntry({ id: 'e4', personId: 'p3', amount: -200 }),
    ];
    expect(getTotalOwedToYou(people, entries)).toBe(1000);
    expect(getTotalYouOwe(people, entries)).toBe(400);
  });

  it('is zero for both totals with no people or entries', () => {
    expect(getTotalOwedToYou([], [])).toBe(0);
    expect(getTotalYouOwe([], [])).toBe(0);
  });
});
