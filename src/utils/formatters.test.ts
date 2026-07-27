import { describe, expect, it } from 'vitest';
import { formatCurrency } from './formatters';

describe('formatCurrency hidden masking', () => {
  it('masks the amount behind dots but keeps the currency symbol', () => {
    expect(formatCurrency(123456, false, true)).toBe('₹••••');
  });

  it('keeps a leading minus sign so direction stays visible without the amount', () => {
    expect(formatCurrency(-500, false, true)).toBe('-₹••••');
  });

  it('masks the same way regardless of the compact flag', () => {
    expect(formatCurrency(999999, true, true)).toBe('₹••••');
  });

  it('is unaffected when hidden is false', () => {
    expect(formatCurrency(1234, false, false)).toBe('₹1,234');
  });
});
