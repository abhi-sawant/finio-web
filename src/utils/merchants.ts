import { roundMoney } from '@/store/balance';
import { normalizeNote } from './insights';
import type { Transaction, TransactionType } from '@/types';

/**
 * "Spending by merchant" without a schema change. `normalizeNote` (insights.ts — the same key
 * subscription detection groups on) strips digits and punctuation, so "Swiggy/9921" and
 * "Swiggy 449" land in the same bucket; the display name is the group's most common raw note,
 * ties broken by recency, so the label still reads like something the user actually typed.
 *
 * This only collapses notes that differ by digits/punctuation, not ones with different
 * surrounding words — a bank-statement "UPI/Swiggy/9921" and a hand-typed "Swiggy" land in
 * separate buckets. Good enough for notes the user types themselves (the common case); a real
 * bank-statement merchant extractor is a bigger, separate piece of work.
 */

export type MerchantTransactionType = Exclude<TransactionType, 'transfer'>;

export interface MerchantSummary {
  /** The normalizeNote() grouping key — stable across a transaction's raw note variations. */
  key: string;
  /** The group's most common raw note — falls back to a note if there's only one. */
  displayName: string;
  type: MerchantTransactionType;
  totalAmount: number;
  transactionCount: number;
  /** ISO date of the most recent transaction in the group. */
  lastDate: string;
  /** Newest first. */
  transactions: Transaction[];
}

function pickDisplayName(transactions: Transaction[]): string {
  const counts = new Map<string, { count: number; lastDate: string }>();
  for (const t of transactions) {
    const raw = t.note.trim();
    const entry = counts.get(raw);
    if (entry) {
      entry.count += 1;
      if (t.date > entry.lastDate) entry.lastDate = t.date;
    } else {
      counts.set(raw, { count: 1, lastDate: t.date });
    }
  }

  let best = '';
  let bestCount = -1;
  let bestDate = '';
  for (const [raw, entry] of counts) {
    if (entry.count > bestCount || (entry.count === bestCount && entry.lastDate > bestDate)) {
      best = raw;
      bestCount = entry.count;
      bestDate = entry.lastDate;
    }
  }
  return best;
}

/**
 * Group expense or income transactions into merchants. Transfers and blank notes are excluded —
 * a transfer has no merchant, and a blank note can't be grouped into anything meaningful. Splits
 * are included and summed by their total `amount`, since a merchant relates to the note, not the
 * per-category allocation.
 */
export function summarizeMerchants(
  transactions: Transaction[],
  type: MerchantTransactionType = 'expense',
): MerchantSummary[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = normalizeNote(t.note);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  const summaries: MerchantSummary[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
    summaries.push({
      key,
      displayName: pickDisplayName(rows),
      type,
      totalAmount: roundMoney(rows.reduce((sum, t) => sum + t.amount, 0)),
      transactionCount: rows.length,
      lastDate: sorted[0].date,
      transactions: sorted,
    });
  }

  return summaries.sort((a, b) => b.totalAmount - a.totalAmount);
}

/** The `n` biggest merchants by total amount — for a compact "top merchants" card. */
export function topMerchants(
  transactions: Transaction[],
  n: number,
  type: MerchantTransactionType = 'expense',
): MerchantSummary[] {
  return summarizeMerchants(transactions, type).slice(0, n);
}
