import { describe, expect, it } from 'vitest';
import {
  buildTransactionsFromCsv,
  detectDateFormat,
  findDuplicateRows,
  parseAmount,
  parseCsvText,
  parseDateWithFormat,
  type ParsedCsvTransaction,
} from './csvImport';
import type { Category, CategoryRule, Transaction } from '@/types';

const uberRule: CategoryRule = {
  id: 'rule-uber',
  pattern: 'uber',
  matchType: 'contains',
  scope: 'any',
  categoryId: 'cat-food',
  labelIds: ['lbl-essential'],
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const categories: Category[] = [
  { id: 'cat-food', name: 'Food', icon: 'utensils', color: '#ef4444', type: 'expense' },
  { id: 'cat-salary', name: 'Salary', icon: 'briefcase', color: '#22c55e', type: 'income' },
  {
    id: 'cat-misc',
    name: 'Miscellaneous',
    icon: 'circle-ellipsis',
    color: '#94a3b8',
    type: 'both',
  },
];

describe('parseCsvText', () => {
  it('splits headers and rows, trimming header whitespace', () => {
    const csv = 'Date, Amount ,Note\n2026-01-01,100,Coffee\n2026-01-02,50,Tea';
    const { headers, rows } = parseCsvText(csv);
    expect(headers).toEqual(['Date', 'Amount', 'Note']);
    expect(rows).toEqual([
      ['2026-01-01', '100', 'Coffee'],
      ['2026-01-02', '50', 'Tea'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'Date,Amount,Note\n2026-01-01,100,"Rent, January"';
    const { rows } = parseCsvText(csv);
    expect(rows).toEqual([['2026-01-01', '100', 'Rent, January']]);
  });

  it('skips leading rows before the header', () => {
    const csv = 'Statement for account 1234\nGenerated on 2026-07-01\nDate,Amount\n2026-01-01,100';
    const { headers, rows } = parseCsvText(csv, 2);
    expect(headers).toEqual(['Date', 'Amount']);
    expect(rows).toEqual([['2026-01-01', '100']]);
  });
});

describe('parseAmount', () => {
  it('parses plain numbers', () => {
    expect(parseAmount('100')).toBe(100);
    expect(parseAmount('-50.5')).toBe(-50.5);
  });

  it('strips currency symbols and thousand separators', () => {
    expect(parseAmount('₹1,234.56')).toBe(1234.56);
    expect(parseAmount('Rs. 2,000')).toBe(2000);
    expect(parseAmount('$1,000.00')).toBe(1000);
  });

  it('treats parentheses as negative (accounting style)', () => {
    expect(parseAmount('(500.00)')).toBe(-500);
  });

  it('returns null for unparseable input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });
});

describe('parseDateWithFormat', () => {
  it('parses every supported format', () => {
    expect(parseDateWithFormat('2026-07-27', 'YYYY-MM-DD')).toBe('2026-07-27T00:00:00.000Z');
    expect(parseDateWithFormat('27/07/2026', 'DD/MM/YYYY')).toBe('2026-07-27T00:00:00.000Z');
    expect(parseDateWithFormat('07/27/2026', 'MM/DD/YYYY')).toBe('2026-07-27T00:00:00.000Z');
    expect(parseDateWithFormat('27-07-2026', 'DD-MM-YYYY')).toBe('2026-07-27T00:00:00.000Z');
    expect(parseDateWithFormat('07-27-2026', 'MM-DD-YYYY')).toBe('2026-07-27T00:00:00.000Z');
    expect(parseDateWithFormat('27.07.2026', 'DD.MM.YYYY')).toBe('2026-07-27T00:00:00.000Z');
  });

  it('rejects out-of-range days/months instead of normalizing them', () => {
    expect(parseDateWithFormat('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDateWithFormat('2026-13-01', 'YYYY-MM-DD')).toBeNull();
  });

  it('rejects empty or garbage input', () => {
    expect(parseDateWithFormat('', 'YYYY-MM-DD')).toBeNull();
    expect(parseDateWithFormat('not a date', 'YYYY-MM-DD')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('prefers YYYY-MM-DD when every sample agrees', () => {
    expect(detectDateFormat(['2026-07-27', '2026-01-05'])).toBe('YYYY-MM-DD');
  });

  it('falls back to DD/MM/YYYY for slash dates with a day above 12', () => {
    expect(detectDateFormat(['27/07/2026', '05/01/2026'])).toBe('DD/MM/YYYY');
  });

  it('returns undefined when samples disagree with every format', () => {
    expect(detectDateFormat(['not a date', 'also not'])).toBeUndefined();
  });
});

describe('buildTransactionsFromCsv', () => {
  it('builds transactions from a signed amount column', () => {
    const rows = [
      ['2026-01-01', '-100', 'Coffee'],
      ['2026-01-02', '5000', 'Paycheck'],
    ];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, noteCol: 2 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });

    expect(result.totalRows).toBe(2);
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].transaction).toMatchObject({
      type: 'expense',
      amount: 100,
      note: 'Coffee',
      accountId: 'acc-1',
      categoryId: 'cat-misc',
    });
    expect(result.accepted[1].transaction).toMatchObject({ type: 'income', amount: 5000 });
  });

  it('honours negativeIsExpense = false', () => {
    const rows = [['2026-01-01', '-100', '']];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, negativeIsExpense: false },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });
    expect(result.accepted[0].transaction.type).toBe('income');
  });

  it('builds transactions from separate debit/credit columns', () => {
    const rows = [
      ['2026-01-01', '250', '', 'Groceries'],
      ['2026-01-02', '', '3000', 'Refund'],
    ];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'debitCredit', debitCol: 1, creditCol: 2, noteCol: 3 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].transaction).toMatchObject({ type: 'expense', amount: 250 });
    expect(result.accepted[1].transaction).toMatchObject({ type: 'income', amount: 3000 });
  });

  it('matches a mapped category column case-insensitively, and falls back otherwise', () => {
    const rows = [
      ['2026-01-01', '-100', 'food'],
      ['2026-01-02', '-50', 'Unknown Category'],
    ];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, categoryCol: 2 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });

    expect(result.accepted[0]).toMatchObject({
      categoryMatched: true,
      transaction: { categoryId: 'cat-food' },
    });
    expect(result.accepted[1]).toMatchObject({
      categoryMatched: false,
      transaction: { categoryId: 'cat-misc' },
    });
  });

  it('rejects rows with an unparseable date or amount, capping reported issues', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ['not-a-date', String(i)]);
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.issues).toHaveLength(9); // 8 reasons + "...and N more"
    expect(result.issues.at(-1)).toMatch(/…and \d+ more/);
  });

  it('applies an auto-categorization rule to rows the file does not categorize', () => {
    const rows = [
      ['2026-01-01', '-250', 'UBER *TRIP 1234'],
      ['2026-01-02', '-80', 'Something else'],
    ];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, noteCol: 2 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
      rules: [uberRule],
    });

    expect(result.accepted[0]).toMatchObject({
      matchedRuleId: 'rule-uber',
      transaction: { categoryId: 'cat-food', labels: ['lbl-essential'] },
    });
    // No rule matched — the fallback category still applies and no labels are invented.
    expect(result.accepted[1].matchedRuleId).toBeUndefined();
    expect(result.accepted[1].transaction).toMatchObject({ categoryId: 'cat-misc', labels: [] });
  });

  it("lets the file's own category column outrank a rule", () => {
    const rows = [['2026-01-01', '-250', 'UBER *TRIP', 'Salary']];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, noteCol: 2, categoryCol: 3 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      // 'Salary' is income-only, so it does not match an expense row and the rule gets its turn.
      categories: [
        ...categories,
        { id: 'cat-cab', name: 'Cab', icon: 'car', color: '#000', type: 'expense' },
      ],
      fallbackCategoryId: 'cat-misc',
      rules: [uberRule],
    });
    expect(result.accepted[0]).toMatchObject({
      matchedRuleId: 'rule-uber',
      transaction: { categoryId: 'cat-food' },
    });

    const mapped = buildTransactionsFromCsv([['2026-01-01', '-250', 'UBER *TRIP', 'Cab']], {
      mapping: { dateCol: 0, amountMode: 'signed', amountCol: 1, noteCol: 2, categoryCol: 3 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories: [
        ...categories,
        { id: 'cat-cab', name: 'Cab', icon: 'car', color: '#000', type: 'expense' },
      ],
      fallbackCategoryId: 'cat-misc',
      rules: [uberRule],
    });
    expect(mapped.accepted[0].matchedRuleId).toBeUndefined();
    expect(mapped.accepted[0].transaction.categoryId).toBe('cat-cab');
  });

  it('rejects debit/credit rows where both or neither are filled', () => {
    const rows = [
      ['2026-01-01', '100', '100'],
      ['2026-01-02', '', ''],
    ];
    const result = buildTransactionsFromCsv(rows, {
      mapping: { dateCol: 0, amountMode: 'debitCredit', debitCol: 1, creditCol: 2 },
      dateFormat: 'YYYY-MM-DD',
      accountId: 'acc-1',
      categories,
      fallbackCategoryId: 'cat-misc',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.issues).toHaveLength(2);
  });
});

describe('findDuplicateRows', () => {
  function candidate(
    rowIndex: number,
    overrides: Partial<ParsedCsvTransaction['transaction']> = {},
  ): ParsedCsvTransaction {
    return {
      rowIndex,
      categoryMatched: true,
      transaction: {
        type: 'expense',
        amount: 100,
        accountId: 'acc-1',
        categoryId: 'cat-food',
        date: '2026-01-01T00:00:00.000Z',
        note: 'Coffee',
        labels: [],
        ...overrides,
      },
    };
  }

  function existingTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
      id: 'tx-1',
      type: 'expense',
      amount: 100,
      accountId: 'acc-1',
      categoryId: 'cat-food',
      date: '2026-01-01T00:00:00.000Z',
      note: 'Coffee',
      labels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('flags a row matching an existing transaction by date+type+amount+note', () => {
    const duplicates = findDuplicateRows([candidate(0)], [existingTx()]);
    expect(duplicates.has(0)).toBe(true);
  });

  it('is case-insensitive and trims the note', () => {
    const duplicates = findDuplicateRows(
      [candidate(0, { note: '  COFFEE  ' })],
      [existingTx({ note: 'coffee' })],
    );
    expect(duplicates.has(0)).toBe(true);
  });

  it('does not flag a different amount, type, or day', () => {
    const duplicates = findDuplicateRows(
      [
        candidate(0, { amount: 200 }),
        candidate(1, { type: 'income' }),
        candidate(2, { date: '2026-01-02T00:00:00.000Z' }),
      ],
      [existingTx()],
    );
    expect(duplicates.size).toBe(0);
  });

  it('flags duplicates within the same batch', () => {
    const duplicates = findDuplicateRows([candidate(0), candidate(1)], []);
    expect(duplicates).toEqual(new Set([1]));
  });
});
