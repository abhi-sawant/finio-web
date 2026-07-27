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

  it('keeps only known settings keys, dropping the legacy currency field', () => {
    const { data } = validateBackup({
      settings: { theme: 'dark', userName: 'Abhishek', autoLocalBackup: true, currency: 'USD' },
    });
    expect(data.settings).toEqual({ theme: 'dark', userName: 'Abhishek', autoLocalBackup: true });
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
});
