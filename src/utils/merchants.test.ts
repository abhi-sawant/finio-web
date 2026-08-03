import { describe, expect, it } from 'vitest';
import { summarizeMerchants, topMerchants } from './merchants';
import type { Transaction } from '@/types';

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>,
): Transaction {
  return {
    id: partial.id ?? `${partial.type}-${partial.amount}-${partial.date}`,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

describe('summarizeMerchants', () => {
  it('groups notes that differ only by digits and punctuation', () => {
    const transactions = [
      tx({ type: 'expense', amount: 250, date: '2026-06-01T00:00:00.000Z', note: 'Swiggy/9921' }),
      tx({ type: 'expense', amount: 400, date: '2026-06-05T00:00:00.000Z', note: 'Swiggy 449' }),
      tx({ type: 'expense', amount: 350, date: '2026-06-10T00:00:00.000Z', note: 'SWIGGY-771' }),
    ];

    const [merchant] = summarizeMerchants(transactions);
    expect(merchant.transactionCount).toBe(3);
    expect(merchant.totalAmount).toBe(1000);
    expect(merchant.lastDate).toBe('2026-06-10T00:00:00.000Z');
  });

  it('picks the most common raw note as the display name, ties broken by recency', () => {
    const transactions = [
      tx({ id: '1', type: 'expense', amount: 100, date: '2026-06-01T00:00:00.000Z', note: 'Swiggy' }),
      tx({ id: '2', type: 'expense', amount: 100, date: '2026-06-05T00:00:00.000Z', note: 'Swiggy' }),
      tx({ id: '3', type: 'expense', amount: 100, date: '2026-06-10T00:00:00.000Z', note: 'SWIGGY 99' }),
    ];

    const [merchant] = summarizeMerchants(transactions);
    expect(merchant.displayName).toBe('Swiggy');
  });

  it('excludes transfers and blank notes', () => {
    const transactions = [
      tx({ type: 'transfer', amount: 5000, date: '2026-06-01T00:00:00.000Z', note: 'Swiggy' }),
      tx({ type: 'expense', amount: 100, date: '2026-06-01T00:00:00.000Z', note: '' }),
      tx({ type: 'expense', amount: 100, date: '2026-06-01T00:00:00.000Z', note: '   ' }),
    ];

    expect(summarizeMerchants(transactions)).toEqual([]);
  });

  it('separates expense and income merchants sharing a note', () => {
    const transactions = [
      tx({ type: 'expense', amount: 200, date: '2026-06-01T00:00:00.000Z', note: 'Zomato refund' }),
      tx({ type: 'income', amount: 50, date: '2026-06-02T00:00:00.000Z', note: 'Zomato refund' }),
    ];

    expect(summarizeMerchants(transactions, 'expense')).toHaveLength(1);
    expect(summarizeMerchants(transactions, 'income')).toHaveLength(1);
    expect(summarizeMerchants(transactions, 'expense')[0].totalAmount).toBe(200);
  });

  it('sorts merchants by total amount descending and lists their transactions newest first', () => {
    const transactions = [
      tx({ id: 'a1', type: 'expense', amount: 100, date: '2026-06-01T00:00:00.000Z', note: 'Amazon' }),
      tx({ id: 'a2', type: 'expense', amount: 100, date: '2026-06-10T00:00:00.000Z', note: 'Amazon' }),
      tx({ id: 'b1', type: 'expense', amount: 900, date: '2026-06-05T00:00:00.000Z', note: 'Rent' }),
    ];

    const summaries = summarizeMerchants(transactions);
    expect(summaries.map((m) => m.displayName)).toEqual(['Rent', 'Amazon']);
    expect(summaries[1].transactions.map((t) => t.id)).toEqual(['a2', 'a1']);
  });
});

describe('topMerchants', () => {
  it('caps the result at n', () => {
    const transactions = ['Amazon', 'Rent', 'Swiggy', 'Zomato'].map((note, i) =>
      tx({ type: 'expense', amount: (i + 1) * 100, date: '2026-06-01T00:00:00.000Z', note }),
    );

    expect(topMerchants(transactions, 2)).toHaveLength(2);
    expect(topMerchants(transactions, 2)[0].displayName).toBe('Zomato');
  });
});
