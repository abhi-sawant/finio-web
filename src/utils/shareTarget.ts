import { roundMoney } from '@/store/balance';
import type { TransactionType } from '@/types';

/**
 * Parsing for the Web Share Target and the manifest shortcuts.
 *
 * Both entry points land on `AddTransaction` with query params rather than app state, so
 * everything here is pure string work: given whatever the OS share sheet handed us, produce a
 * draft transaction the form can seed itself from.
 */

/** Notes longer than this are a wall of SMS boilerplate, not a description. */
export const NOTE_MAX_LENGTH = 140;

/** Anything above this is a parse error, not a transaction. */
const MAX_SHARED_AMOUNT = 1e9;

/**
 * A number is only an amount if it is next to a currency marker.
 *
 * This is the whole guard against a payment SMS: "A/c XX1234 debited by Rs 99.00" contains two
 * plausible-looking numbers and only one of them is money. Card masks, reference ids, OTPs and
 * dates all lose to this rule, which is the point.
 */
const CURRENCY_AMOUNT =
  /(?:₹|\bRs\.?|\bINR\b)\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*(?:₹|\bINR\b)/i;

/** Indian bank SMS say credited/received for inflow and debited/spent/paid for outflow. */
const INCOME_WORDS = /\b(credited|received|deposited|refund(?:ed)?|salary|cashback)\b/i;

const LOOKS_LIKE_URL = /^https?:\/\/\S+$/i;

/** A transaction seeded from shared text. `amount` is a string because `NumberPad` is. */
export interface SharedTransactionDraft {
  type: TransactionType;
  amount: string;
  note: string;
}

/**
 * Pull a money amount out of shared text, or null when there is nothing that is definitely money.
 * Handles Indian digit grouping (`1,23,456.78`) since the group pattern is just `[\d,]+`.
 */
export function extractAmount(text: string): number | null {
  const match = CURRENCY_AMOUNT.exec(text);
  if (!match) return null;

  const raw = match[1] ?? match[2];
  if (!raw) return null;

  const parsed = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_SHARED_AMOUNT) return null;

  return roundMoney(parsed);
}

/** Expense unless the text clearly describes money arriving — by far the common share. */
export function inferTransactionType(text: string): TransactionType {
  return INCOME_WORDS.test(text) ? 'income' : 'expense';
}

function isTransactionType(value: string | null | undefined): value is TransactionType {
  return value === 'expense' || value === 'income' || value === 'transfer';
}

/** `https://swiggy.com/order/123` → `swiggy.com`, so a bare link still reads as something. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Turn the share sheet's `title`/`text`/`url` (and a shortcut's `type`) into a draft.
 *
 * An explicit `type` always beats inference: it comes from a manifest shortcut the user
 * deliberately tapped, whereas inference is a guess about someone else's wording.
 */
export function parseSharePayload(params: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  type?: string | null;
}): SharedTransactionDraft {
  const title = params.title?.trim() ?? '';
  const text = params.text?.trim() ?? '';
  const url = params.url?.trim() ?? '';

  const combined = [title, text].filter(Boolean).join(' ').trim();

  // Many share sheets put the link in `text` rather than `url`. A raw URL is a terrible note,
  // so fall back to its hostname either way.
  const note = LOOKS_LIKE_URL.test(combined)
    ? hostnameOf(combined)
    : combined || (url ? hostnameOf(url) : '');

  const searchable = [combined, url].filter(Boolean).join(' ');
  const amount = searchable ? extractAmount(searchable) : null;

  return {
    type: isTransactionType(params.type) ? params.type : inferTransactionType(searchable),
    amount: amount === null ? '' : amount.toString(),
    note: note.slice(0, NOTE_MAX_LENGTH).trim(),
  };
}
