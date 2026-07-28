import { describe, expect, it } from 'vitest';
import {
  extractAmount,
  inferTransactionType,
  NOTE_MAX_LENGTH,
  parseSharePayload,
} from './shareTarget';

describe('extractAmount', () => {
  it('reads an amount that follows a currency marker', () => {
    expect(extractAmount('Rs. 1,234.56 debited')).toBe(1234.56);
    expect(extractAmount('₹500')).toBe(500);
    expect(extractAmount('Paid INR 250 to Swiggy')).toBe(250);
  });

  it('reads an amount that precedes a currency marker', () => {
    expect(extractAmount('1,200 INR was spent')).toBe(1200);
    expect(extractAmount('450 ₹')).toBe(450);
  });

  it('handles Indian digit grouping', () => {
    expect(extractAmount('INR 1,23,456.78 credited')).toBe(123456.78);
  });

  it('ignores a number with no currency marker', () => {
    // Otherwise every reference id, OTP and date in a message becomes a candidate amount.
    expect(extractAmount('Sent 250 to Ravi')).toBeNull();
    expect(extractAmount('Order 4821 confirmed')).toBeNull();
  });

  it('picks the money out of a payment SMS rather than the account mask', () => {
    expect(extractAmount('A/c XX1234 debited by Rs 99.00 at SWIGGY')).toBe(99);
  });

  it('rejects a zero or negative amount', () => {
    expect(extractAmount('Rs 0')).toBeNull();
    expect(extractAmount('Rs 0.00 charged')).toBeNull();
  });

  it('rejects an implausibly large amount', () => {
    expect(extractAmount('Rs 9,999,999,999')).toBeNull();
  });

  it('returns null for text with no numbers at all', () => {
    expect(extractAmount('')).toBeNull();
    expect(extractAmount('Coffee with Sam')).toBeNull();
  });

  it('is case-insensitive about the marker', () => {
    expect(extractAmount('rs 75 spent')).toBe(75);
    expect(extractAmount('inr 75 spent')).toBe(75);
  });
});

describe('inferTransactionType', () => {
  it('reads money arriving as income', () => {
    expect(inferTransactionType('Rs 5000 credited to your account')).toBe('income');
    expect(inferTransactionType('Refund of Rs 200 received')).toBe('income');
    expect(inferTransactionType('Salary for June')).toBe('income');
  });

  it('reads money leaving as an expense', () => {
    expect(inferTransactionType('Rs 99 debited at SWIGGY')).toBe('expense');
    expect(inferTransactionType('You spent Rs 340')).toBe('expense');
  });

  it('defaults to expense when the wording is ambiguous', () => {
    expect(inferTransactionType('Rs 120')).toBe('expense');
    expect(inferTransactionType('')).toBe('expense');
  });
});

describe('parseSharePayload', () => {
  it('joins title and text into the note', () => {
    const draft = parseSharePayload({ title: 'Swiggy', text: 'Rs 99 debited' });
    expect(draft.note).toBe('Swiggy Rs 99 debited');
    expect(draft.amount).toBe('99');
    expect(draft.type).toBe('expense');
  });

  it('surfaces the amount as a string, because the number pad is string-driven', () => {
    const draft = parseSharePayload({ text: 'Rs 1,234.50 debited' });
    expect(draft.amount).toBe('1234.5');
  });

  it('leaves the amount blank when nothing parses', () => {
    expect(parseSharePayload({ text: 'Lunch with Sam' }).amount).toBe('');
  });

  it('uses the hostname when the share is just a link', () => {
    expect(parseSharePayload({ url: 'https://www.swiggy.com/order/123' }).note).toBe('swiggy.com');
    // Some share sheets put the link in `text` instead of `url`.
    expect(parseSharePayload({ text: 'https://zomato.com/x' }).note).toBe('zomato.com');
  });

  it('lets an explicit type param beat inference', () => {
    // The shortcut the user tapped is a decision; the wording of someone else's SMS is a guess.
    const draft = parseSharePayload({ text: 'Rs 5000 credited', type: 'expense' });
    expect(draft.type).toBe('expense');
  });

  it('ignores a type param that is not a transaction type', () => {
    expect(parseSharePayload({ text: 'Rs 10 debited', type: 'nonsense' }).type).toBe('expense');
    expect(parseSharePayload({ text: 'Rs 10 credited', type: '' }).type).toBe('income');
  });

  it('truncates a long note', () => {
    const draft = parseSharePayload({ text: 'x'.repeat(400) });
    expect(draft.note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('returns an empty draft for an empty share', () => {
    expect(parseSharePayload({})).toEqual({ type: 'expense', amount: '', note: '' });
  });
});
