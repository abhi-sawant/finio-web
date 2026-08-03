import { describe, expect, it } from 'vitest';
import { formatCurrency, shouldCompactGroup } from './formatters';

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

describe('formatCurrency precision', () => {
  it('shows paise by default', () => {
    expect(formatCurrency(3214.64)).toBe('₹3,214.64');
  });

  it('rounds to whole rupees when precise is false', () => {
    expect(formatCurrency(3214.64, false, false, { precise: false })).toBe('₹3,215');
  });

  it('rounds a negative amount to whole rupees too', () => {
    expect(formatCurrency(-1867.25, false, false, { precise: false })).toBe('-₹1,867');
  });
});

describe('shouldCompactGroup', () => {
  it('is false when every member is under the threshold', () => {
    expect(shouldCompactGroup([90_010, 45_000])).toBe(false);
  });

  it('is true the moment any member crosses the threshold', () => {
    expect(shouldCompactGroup([230_000, 90_010])).toBe(true);
  });

  it('checks magnitude, not sign', () => {
    expect(shouldCompactGroup([-150_000, 500])).toBe(true);
  });
});

describe('formatCurrency forceCompact', () => {
  it('compacts a value that would not cross the threshold on its own', () => {
    // Paired with a value like ₹2.3L, ₹90,010 should read as ₹90K rather than mixing
    // notations — this is what shouldCompactGroup + forceCompact is for.
    expect(formatCurrency(90_010, true, false, { forceCompact: true })).toBe('₹90K');
  });

  it('leaves the normal per-value gate alone when forceCompact is false', () => {
    expect(formatCurrency(90_010, true, false, { forceCompact: false })).toBe('₹90,010');
  });

  it('leaves the normal per-value gate alone when forceCompact is omitted', () => {
    expect(formatCurrency(230_000, true, false)).toBe('₹2.3L');
    expect(formatCurrency(90_010, true, false)).toBe('₹90,010');
  });
});
