import { describe, expect, it } from 'vitest';
import { buildInsights, detectSubscriptions, normalizeNote } from './insights';
import type { Budget, Category, RecurringTransaction, Transaction } from '@/types';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food', icon: 'utensils', color: '#f00', type: 'expense' },
  { id: 'cat-fun', name: 'Entertainment', icon: 'clapperboard', color: '#0f0', type: 'expense' },
];

/** Insight copy is money-free by design; tests render amounts plainly to keep assertions readable. */
const money = (value: number) => `Rs${value}`;

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>,
): Transaction {
  return {
    id: partial.id ?? `${partial.type}-${partial.amount}-${partial.date}`,
    accountId: 'acc-1',
    categoryId: 'cat-food',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

function subscriptionRows(note: string, amount: number, months: number[]): Transaction[] {
  return months.map((month) =>
    tx({
      id: `${note}-${month}`,
      type: 'expense',
      amount,
      date: `2026-0${month}-05T00:00:00.000Z`,
      note,
      categoryId: 'cat-fun',
    }),
  );
}

function baseInput(transactions: Transaction[]) {
  return {
    transactions,
    categories: CATEGORIES,
    labels: [],
    budgets: [] as Budget[],
    recurring: [] as RecurringTransaction[],
    now: NOW,
  };
}

describe('normalizeNote', () => {
  it('reduces a note to its recognisable core', () => {
    expect(normalizeNote('UPI/Spotify/9921')).toBe('upi spotify');
    expect(normalizeNote('Spotify 449')).toBe('spotify');
    expect(normalizeNote('  NETFLIX!! ')).toBe('netflix');
  });
});

describe('detectSubscriptions', () => {
  it('finds a monthly charge that repeats for the same amount', () => {
    const [candidate] = detectSubscriptions(subscriptionRows('Spotify', 499, [3, 4, 5]), [], NOW);

    expect(candidate.note).toBe('Spotify');
    expect(candidate.amount).toBe(499);
    expect(candidate.frequency).toBe('monthly');
    expect(candidate.occurrences).toBe(3);
    expect(candidate.categoryId).toBe('cat-fun');
  });

  it('always proposes a start date in the future, so nothing is backfilled', () => {
    const [candidate] = detectSubscriptions(subscriptionRows('Spotify', 499, [3, 4, 5]), [], NOW);
    expect(new Date(candidate.nextDate).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('needs at least three charges', () => {
    expect(detectSubscriptions(subscriptionRows('Spotify', 499, [4, 5]), [], NOW)).toEqual([]);
  });

  it('rejects amounts that wander', () => {
    const rows = subscriptionRows('Groceries', 500, [3, 4, 5]);
    rows[1].amount = 1400;
    expect(detectSubscriptions(rows, [], NOW)).toEqual([]);
  });

  it('rejects charges with no regular cadence', () => {
    const rows = [
      tx({ type: 'expense', amount: 499, date: '2026-03-05T00:00:00.000Z', note: 'Coffee' }),
      tx({ type: 'expense', amount: 499, date: '2026-03-09T00:00:00.000Z', note: 'Coffee' }),
      tx({ type: 'expense', amount: 499, date: '2026-06-01T00:00:00.000Z', note: 'Coffee' }),
    ];
    expect(detectSubscriptions(rows, [], NOW)).toEqual([]);
  });

  it('skips a charge an existing recurring rule already covers', () => {
    const rule: RecurringTransaction = {
      id: 'rule-1',
      type: 'expense',
      amount: 499,
      accountId: 'acc-1',
      categoryId: 'cat-fun',
      note: 'Spotify',
      labels: [],
      frequency: 'monthly',
      startDate: '2026-03-05T00:00:00.000Z',
      occurrenceCount: 3,
      lastRunDate: '2026-05-05T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
    };

    expect(detectSubscriptions(subscriptionRows('Spotify', 499, [3, 4, 5]), [rule], NOW)).toEqual(
      [],
    );
  });

  it('ignores rows a rule already generated, and split receipts', () => {
    const generated = subscriptionRows('Spotify', 499, [3, 4, 5]).map((row) => ({
      ...row,
      recurringId: 'rule-1',
    }));
    expect(detectSubscriptions(generated, [], NOW)).toEqual([]);

    const split = subscriptionRows('Spotify', 499, [3, 4, 5]).map((row) => ({
      ...row,
      categoryId: '',
      splits: [
        { categoryId: 'cat-fun', amount: 400 },
        { categoryId: 'cat-food', amount: 99 },
      ],
    }));
    expect(detectSubscriptions(split, [], NOW)).toEqual([]);
  });
});

describe('buildInsights', () => {
  it('flags a category running above its own multi-month average', () => {
    const history = [
      tx({ type: 'expense', amount: 4000, date: '2026-03-10T00:00:00.000Z' }),
      tx({ type: 'expense', amount: 4000, date: '2026-04-10T00:00:00.000Z' }),
      tx({ type: 'expense', amount: 4000, date: '2026-05-10T00:00:00.000Z' }),
      // Half of June gone with 4000 already spent → on pace for 8000.
      tx({ type: 'expense', amount: 4000, date: '2026-06-10T00:00:00.000Z' }),
    ];

    const insights = buildInsights(baseInput(history), { formatAmount: money });
    const spike = insights.find((i) => i.kind === 'category-spike');

    expect(spike?.title).toBe('Food is 100% above your 3-month average');
    expect(spike?.severity).toBe('warn');
  });

  it('paces the current month rather than reading it as a collapse', () => {
    const steady = [
      tx({ type: 'expense', amount: 4000, date: '2026-04-10T00:00:00.000Z' }),
      tx({ type: 'expense', amount: 4000, date: '2026-05-10T00:00:00.000Z' }),
      tx({ type: 'expense', amount: 2000, date: '2026-06-10T00:00:00.000Z' }),
    ];

    const insights = buildInsights(baseInput(steady), { formatAmount: money });
    expect(insights.some((i) => i.kind === 'category-drop')).toBe(false);
  });

  it('needs enough history before comparing against an average', () => {
    const insights = buildInsights(
      baseInput([
        tx({ type: 'expense', amount: 4000, date: '2026-05-10T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 9000, date: '2026-06-10T00:00:00.000Z' }),
      ]),
      { formatAmount: money },
    );

    expect(insights.some((i) => i.kind === 'category-spike')).toBe(false);
  });

  it('offers to turn a detected subscription into a recurring rule', () => {
    const insights = buildInsights(baseInput(subscriptionRows('Spotify', 499, [3, 4, 5])), {
      formatAmount: money,
    });
    const subscription = insights.find((i) => i.kind === 'subscription');

    expect(subscription?.action?.type).toBe('create-recurring');
    expect(subscription?.title).toContain('Spotify');
  });

  it('warns when a budget is over and when it is on pace to be', () => {
    const budgets: Budget[] = [
      {
        id: 'b-over',
        categoryId: 'cat-food',
        amount: 1000,
        period: 'monthly',
        rollover: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b-pace',
        categoryId: 'cat-fun',
        amount: 1000,
        period: 'monthly',
        rollover: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const insights = buildInsights(
      {
        ...baseInput([
          tx({ type: 'expense', amount: 1500, date: '2026-06-05T00:00:00.000Z' }),
          tx({
            type: 'expense',
            amount: 800,
            date: '2026-06-05T00:00:00.000Z',
            categoryId: 'cat-fun',
          }),
        ]),
        budgets,
      },
      { formatAmount: money },
    );

    expect(insights.find((i) => i.kind === 'budget-over')?.title).toContain('Food');
    expect(insights.find((i) => i.kind === 'budget-pace')?.title).toContain('Entertainment');
  });

  it('calls out overspending your income, and a healthy savings rate', () => {
    const overspent = buildInsights(
      baseInput([
        tx({ type: 'income', amount: 10000, date: '2026-06-01T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 14000, date: '2026-06-05T00:00:00.000Z' }),
      ]),
      { formatAmount: money },
    );
    expect(overspent.find((i) => i.kind === 'savings-rate')?.severity).toBe('warn');

    const saving = buildInsights(
      baseInput([
        tx({ type: 'income', amount: 10000, date: '2026-06-01T00:00:00.000Z' }),
        tx({ type: 'expense', amount: 5000, date: '2026-06-05T00:00:00.000Z' }),
      ]),
      { formatAmount: money },
    );
    expect(saving.find((i) => i.kind === 'savings-rate')?.severity).toBe('good');
  });

  it('sorts warnings first and honours the limit', () => {
    const insights = buildInsights(
      {
        ...baseInput([
          tx({ type: 'income', amount: 10000, date: '2026-06-01T00:00:00.000Z' }),
          tx({ type: 'expense', amount: 14000, date: '2026-06-05T00:00:00.000Z' }),
          ...subscriptionRows('Spotify', 499, [3, 4, 5]),
        ]),
        limit: 2,
      },
      { formatAmount: money },
    );

    expect(insights).toHaveLength(2);
    expect(insights[0].severity).toBe('warn');
  });

  it('says nothing at all about an empty ledger', () => {
    expect(buildInsights(baseInput([]), { formatAmount: money })).toEqual([]);
  });
});
