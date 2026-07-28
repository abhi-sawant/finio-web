import { describe, expect, it } from 'vitest';
import { validateBackup } from './importValidation';

const validAccount = {
  id: 'acc-1',
  name: 'HDFC',
  type: 'checking',
  color: '#000',
  icon: 'landmark',
  balance: 1000,
  openingBalance: 1000,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const validTransaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 250,
  accountId: 'acc-1',
  categoryId: 'cat-1',
  date: '2026-06-01T00:00:00.000Z',
  note: 'Lunch',
  labels: ['lbl-1'],
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('validateBackup', () => {
  it('rejects anything that is not an object', () => {
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup('{}')).toThrow();
    expect(() => validateBackup([validAccount])).toThrow();
  });

  it('rejects an object with no importable keys', () => {
    expect(() => validateBackup({ foo: 'bar' })).toThrow(/not a finio backup/i);
  });

  it('accepts a well-formed backup untouched', () => {
    const { data, report } = validateBackup({
      accounts: [validAccount],
      transactions: [validTransaction],
    });
    expect(data.accounts).toEqual([validAccount]);
    expect(data.transactions).toEqual([validTransaction]);
    expect(report.counts.accounts).toEqual({ present: true, total: 1, accepted: 1, rejected: 0 });
    expect(report.issues).toEqual([]);
  });

  it('drops malformed rows and counts them instead of importing them', () => {
    const { data, report } = validateBackup({
      transactions: [
        validTransaction,
        { ...validTransaction, id: 'tx-2', amount: 'lots' },
        { ...validTransaction, id: 'tx-3', type: 'refund' },
        { ...validTransaction, id: 'tx-4', date: 'yesterday' },
        { ...validTransaction, id: 'tx-5', amount: -40 },
        { ...validTransaction, id: 'tx-6', accountId: '' },
        { ...validTransaction, id: '' },
        'nope',
      ],
    });

    expect(data.transactions?.map((t) => t.id)).toEqual(['tx-1']);
    expect(report.counts.transactions.rejected).toBe(7);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('rejects a transfer with no destination account', () => {
    const { data, report } = validateBackup({
      transactions: [{ ...validTransaction, type: 'transfer' }],
    });
    expect(data.transactions).toEqual([]);
    expect(report.issues[0]).toMatch(/destination/);
  });

  it('accepts a valid split and blanks the top-level categoryId', () => {
    const { data } = validateBackup({
      transactions: [
        {
          ...validTransaction,
          splits: [
            { categoryId: 'cat-1', amount: 150 },
            { categoryId: 'cat-2', amount: 100 },
          ],
        },
      ],
    });
    expect(data.transactions?.[0].categoryId).toBe('');
    expect(data.transactions?.[0].splits).toEqual([
      { categoryId: 'cat-1', amount: 150 },
      { categoryId: 'cat-2', amount: 100 },
    ]);
  });

  it('drops a split that does not sum to the amount, keeping the transaction unsplit', () => {
    const { data } = validateBackup({
      transactions: [
        {
          ...validTransaction,
          splits: [
            { categoryId: 'cat-1', amount: 150 },
            { categoryId: 'cat-2', amount: 999 },
          ],
        },
      ],
    });
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions?.[0].splits).toBeUndefined();
    expect(data.transactions?.[0].categoryId).toBe('cat-1');
  });

  it('drops a malformed split (a single entry, or a missing categoryId), keeping the transaction unsplit', () => {
    const { data } = validateBackup({
      transactions: [
        { ...validTransaction, id: 'tx-a', splits: [{ categoryId: 'cat-1', amount: 250 }] },
        {
          ...validTransaction,
          id: 'tx-b',
          splits: [
            { categoryId: '', amount: 150 },
            { categoryId: 'cat-2', amount: 100 },
          ],
        },
      ],
    });
    expect(data.transactions).toHaveLength(2);
    expect(data.transactions?.every((t) => t.splits === undefined)).toBe(true);
  });

  it('keeps the first of two rows sharing an id', () => {
    const { data, report } = validateBackup({
      accounts: [validAccount, { ...validAccount, name: 'Impostor' }],
    });
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts?.[0].name).toBe('HDFC');
    expect(report.issues[0]).toMatch(/duplicate id/);
  });

  it('ignores a collection that is not an array rather than throwing', () => {
    const { data, report } = validateBackup({ accounts: [validAccount], budgets: 'all of them' });
    expect(data.accounts).toHaveLength(1);
    expect(data.budgets).toBeUndefined();
    expect(report.issues[0]).toMatch(/expected a list/i);
  });

  it('defaults a pre-v7 budget to a monthly, non-rolling limit', () => {
    const { data } = validateBackup({
      budgets: [{ id: 'b-1', categoryId: 'cat-1', amount: 500, createdAt: '2026-01-01' }],
    });
    expect(data.budgets?.[0]).toMatchObject({ period: 'monthly', rollover: false });
  });

  it('keeps a label budget and rejects an unknown period', () => {
    const { data } = validateBackup({
      budgets: [
        {
          id: 'b-1',
          categoryId: '',
          labelId: 'lbl-1',
          amount: 500,
          period: 'fortnightly',
          rollover: true,
          createdAt: '2026-01-01',
        },
      ],
    });
    expect(data.budgets?.[0]).toMatchObject({
      labelId: 'lbl-1',
      period: 'monthly',
      rollover: true,
    });
  });

  it('accepts recurring transfers but not ones missing a destination', () => {
    const base = {
      id: 'r-1',
      type: 'transfer',
      amount: 100,
      accountId: 'acc-1',
      categoryId: 'cat-13',
      note: '',
      labels: [],
      frequency: 'monthly',
      startDate: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      recurring: [
        { ...base, toAccountId: 'acc-2', endDate: '2026-12-31T00:00:00.000Z', maxOccurrences: 12 },
        { ...base, id: 'r-2' },
      ],
    });

    expect(data.recurring).toHaveLength(1);
    expect(data.recurring?.[0]).toMatchObject({
      toAccountId: 'acc-2',
      maxOccurrences: 12,
      occurrenceCount: 0,
    });
    expect(report.counts.recurring.rejected).toBe(1);
  });

  it('keeps only known settings keys, dropping the legacy currency field', () => {
    const { data } = validateBackup({
      settings: { theme: 'dark', userName: 'Abhishek', autoLocalBackup: true, currency: 'USD' },
    });
    expect(data.settings).toEqual({
      theme: 'dark',
      userName: 'Abhishek',
      autoLocalBackup: true,
      monthStartDay: 1,
      hideAmounts: false,
      notificationsEnabled: false,
      notifyBills: true,
      notifyBudgets: true,
      notifyCreditDue: true,
      notifyLeadDays: 2,
    });
  });

  it('clamps an out-of-range notification lead time', () => {
    expect(validateBackup({ settings: { notifyLeadDays: 99 } }).data.settings?.notifyLeadDays).toBe(
      7,
    );
    expect(validateBackup({ settings: { notifyLeadDays: -3 } }).data.settings?.notifyLeadDays).toBe(
      0,
    );
    // A non-number falls back to the default rather than poisoning the schedule with NaN.
    expect(
      validateBackup({ settings: { notifyLeadDays: 'soon' } }).data.settings?.notifyLeadDays,
    ).toBe(2);
  });

  it('clamps an out-of-range month start day instead of trusting the file', () => {
    expect(validateBackup({ settings: { monthStartDay: 31 } }).data.settings?.monthStartDay).toBe(
      28,
    );
    expect(
      validateBackup({ settings: { monthStartDay: 'the 5th' } }).data.settings?.monthStartDay,
    ).toBe(1);
  });

  it('falls back to defaults for unknown settings values', () => {
    const { data } = validateBackup({ settings: { theme: 'neon', autoLocalBackup: 'yes' } });
    expect(data.settings?.theme).toBe('system');
    expect(data.settings?.autoLocalBackup).toBe(false);
  });

  it('warns about transactions pointing at an account the file does not contain', () => {
    const { data, report } = validateBackup({
      accounts: [validAccount],
      transactions: [validTransaction, { ...validTransaction, id: 'tx-2', accountId: 'ghost' }],
    });
    // Kept, not dropped — deleting money records over a reference problem is worse.
    expect(data.transactions).toHaveLength(2);
    expect(report.warnings.some((w) => /account that is not in this file/.test(w))).toBe(true);
  });

  it('warns about budgets pointing at a missing category but allows the overall budget', () => {
    const { report } = validateBackup({
      categories: [{ id: 'cat-1', name: 'Food', icon: 'x', color: '#000', type: 'expense' }],
      budgets: [
        { id: 'b-1', categoryId: '', amount: 5000, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b-2', categoryId: 'cat-9', amount: 500, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(report.counts.budgets.accepted).toBe(2);
    expect(report.warnings.some((w) => /1 budget reference/.test(w))).toBe(true);
  });

  it('warns when accounts arrive without an opening balance', () => {
    const legacy = { ...validAccount, openingBalance: undefined };
    const { data, report } = validateBackup({ accounts: [legacy] });
    expect(data.accounts?.[0].openingBalance).toBeUndefined();
    expect(report.warnings.some((w) => /opening balance/.test(w))).toBe(true);
  });

  it('rejects budgets with a non-positive amount', () => {
    const { report } = validateBackup({
      budgets: [{ id: 'b-1', categoryId: '', amount: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(report.counts.budgets.rejected).toBe(1);
  });

  it('rejects recurring rules that are transfers or have an unknown frequency', () => {
    const base = {
      id: 'r-1',
      type: 'expense',
      amount: 100,
      accountId: 'acc-1',
      categoryId: 'cat-1',
      note: '',
      labels: [],
      frequency: 'monthly',
      startDate: '2026-01-01T00:00:00.000Z',
      lastRunDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      recurring: [
        base,
        { ...base, id: 'r-2', type: 'transfer' },
        { ...base, id: 'r-3', frequency: 'fortnightly' },
      ],
    });
    expect(data.recurring?.map((r) => r.id)).toEqual(['r-1']);
    expect(report.counts.recurring.rejected).toBe(2);
  });

  it('caps the reported issue list and says how many more there are', () => {
    const bad = Array.from({ length: 20 }, (_, i) => ({
      ...validTransaction,
      id: `tx-${i}`,
      amount: 'x',
    }));
    const { report } = validateBackup({ transactions: bad });
    expect(report.counts.transactions.rejected).toBe(20);
    expect(report.issues).toHaveLength(9);
    expect(report.issues.at(-1)).toMatch(/and 12 more/);
  });

  it('accepts a well-formed template and rejects a transfer template with no destination', () => {
    const validTemplate = {
      id: 'tpl-1',
      name: 'Coffee',
      type: 'expense',
      amount: 150,
      accountId: 'acc-1',
      categoryId: 'cat-1',
      note: '',
      labels: [],
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      templates: [validTemplate, { ...validTemplate, id: 'tpl-2', type: 'transfer' }],
    });
    expect(data.templates?.map((t) => t.id)).toEqual(['tpl-1']);
    expect(report.counts.templates).toEqual({ present: true, total: 2, accepted: 1, rejected: 1 });
  });

  it('accepts a well-formed rule and rejects malformed ones', () => {
    const validRule = {
      id: 'rule-1',
      pattern: 'Uber',
      matchType: 'contains',
      scope: 'expense',
      categoryId: 'cat-2',
      labelIds: ['lbl-1'],
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      rules: [
        validRule,
        { ...validRule, id: 'rule-2', pattern: '' },
        { ...validRule, id: 'rule-3', matchType: 'sounds-like' },
        { ...validRule, id: 'rule-4', categoryId: '' },
        // An unparseable regex would match nothing on every transaction, forever.
        { ...validRule, id: 'rule-5', matchType: 'regex', pattern: '([' },
      ],
    });
    expect(data.rules?.map((r) => r.id)).toEqual(['rule-1']);
    expect(report.counts.rules).toEqual({ present: true, total: 5, accepted: 1, rejected: 4 });
  });

  it('defaults a rule to any-scope and enabled when those fields are missing', () => {
    const { data } = validateBackup({
      rules: [{ id: 'rule-1', pattern: 'Uber', matchType: 'contains', categoryId: 'cat-2' }],
    });
    expect(data.rules?.[0]).toMatchObject({ scope: 'any', enabled: true, labelIds: [] });
  });

  it('warns when a rule files into a category the file does not carry', () => {
    const { report } = validateBackup({
      categories: [
        { id: 'cat-1', name: 'Food', icon: 'utensils', color: '#ef4444', type: 'expense' },
      ],
      rules: [
        {
          id: 'rule-1',
          pattern: 'Uber',
          matchType: 'contains',
          categoryId: 'cat-gone',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(report.warnings.some((w) => w.includes('categorization rule'))).toBe(true);
  });

  it('accepts a well-formed goal and rejects one with a non-positive target amount', () => {
    const validGoal = {
      id: 'goal-1',
      name: 'Emergency Fund',
      icon: 'target',
      color: '#6C63FF',
      targetAmount: 10000,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      goals: [validGoal, { ...validGoal, id: 'goal-2', targetAmount: 0 }],
    });
    expect(data.goals?.map((g) => g.id)).toEqual(['goal-1']);
    expect(report.counts.goals).toEqual({ present: true, total: 2, accepted: 1, rejected: 1 });
  });

  it('accepts a well-formed goal contribution and rejects one with a zero amount', () => {
    const validContribution = {
      id: 'contrib-1',
      goalId: 'goal-1',
      amount: 500,
      date: '2026-01-05T00:00:00.000Z',
      note: 'Bonus',
      createdAt: '2026-01-05T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      goalContributions: [validContribution, { ...validContribution, id: 'contrib-2', amount: 0 }],
    });
    expect(data.goalContributions?.map((c) => c.id)).toEqual(['contrib-1']);
    expect(report.counts.goalContributions).toEqual({
      present: true,
      total: 2,
      accepted: 1,
      rejected: 1,
    });
  });

  it('warns about goal contributions pointing at a goal the file does not contain', () => {
    const { report } = validateBackup({
      goals: [
        {
          id: 'goal-1',
          name: 'Emergency Fund',
          icon: 'target',
          color: '#6C63FF',
          targetAmount: 10000,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      goalContributions: [
        {
          id: 'contrib-1',
          goalId: 'ghost-goal',
          amount: 500,
          date: '2026-01-05T00:00:00.000Z',
          note: '',
          createdAt: '2026-01-05T00:00:00.000Z',
        },
      ],
    });
    expect(report.warnings.some((w) => /goal that is not in this file/.test(w))).toBe(true);
  });

  it('accepts a well-formed person and rejects one with no name', () => {
    const validPerson = {
      id: 'person-1',
      name: 'Rahul',
      icon: 'user',
      color: '#6C63FF',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      people: [validPerson, { ...validPerson, id: 'person-2', name: '' }],
    });
    expect(data.people?.map((p) => p.id)).toEqual(['person-1']);
    expect(report.counts.people).toEqual({ present: true, total: 2, accepted: 1, rejected: 1 });
  });

  it('accepts a well-formed debt entry and rejects one with a zero amount', () => {
    const validEntry = {
      id: 'entry-1',
      personId: 'person-1',
      amount: 500,
      date: '2026-01-05T00:00:00.000Z',
      note: 'Lunch money',
      createdAt: '2026-01-05T00:00:00.000Z',
    };
    const { data, report } = validateBackup({
      debtEntries: [validEntry, { ...validEntry, id: 'entry-2', amount: 0 }],
    });
    expect(data.debtEntries?.map((e) => e.id)).toEqual(['entry-1']);
    expect(report.counts.debtEntries).toEqual({
      present: true,
      total: 2,
      accepted: 1,
      rejected: 1,
    });
  });

  it('warns about debt entries pointing at a person the file does not contain', () => {
    const { report } = validateBackup({
      people: [
        {
          id: 'person-1',
          name: 'Rahul',
          icon: 'user',
          color: '#6C63FF',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      debtEntries: [
        {
          id: 'entry-1',
          personId: 'ghost-person',
          amount: 500,
          date: '2026-01-05T00:00:00.000Z',
          note: '',
          createdAt: '2026-01-05T00:00:00.000Z',
        },
      ],
    });
    expect(report.warnings.some((w) => /person that is not in this file/.test(w))).toBe(true);
  });
  it('keeps well-formed net worth snapshots and drops ones with an unusable period key', () => {
    const { data, report } = validateBackup({
      netWorthSnapshots: [
        {
          id: 'snap-1',
          periodKey: '2026-04',
          date: '2026-04-30T23:59:59.999Z',
          assets: 12000,
          liabilities: 2000,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        // A snapshot on the wrong month is worse than a missing one — the trend line would lie.
        {
          id: 'snap-2',
          periodKey: 'April 2026',
          date: '2026-04-30T23:59:59.999Z',
          assets: 1,
          liabilities: 0,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        { id: 'snap-3', periodKey: '2026-05', date: 'not a date', assets: 1, liabilities: 0 },
      ],
    });

    expect(data.netWorthSnapshots).toHaveLength(1);
    expect(data.netWorthSnapshots?.[0].periodKey).toBe('2026-04');
    expect(report.counts.netWorthSnapshots).toEqual({
      present: true,
      total: 3,
      accepted: 1,
      rejected: 2,
    });
  });
});
