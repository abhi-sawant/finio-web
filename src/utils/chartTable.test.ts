import { describe, it, expect } from 'vitest';
import { sampleForTable } from './chartTable';

describe('sampleForTable', () => {
  it('leaves a series that already fits untouched', () => {
    const items = [1, 2, 3];
    const result = sampleForTable(items, 24);
    expect(result.sampled).toBe(false);
    expect(result.rows).toBe(items);
  });

  it('keeps the first and last point of a long series', () => {
    const items = Array.from({ length: 90 }, (_, i) => i);
    const { rows, sampled } = sampleForTable(items, 24);

    expect(sampled).toBe(true);
    expect(rows).toHaveLength(24);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(89);
  });

  it('samples in order without repeating a point', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const { rows } = sampleForTable(items, 10);

    expect(rows).toStrictEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('handles a boundary length exactly at the cap', () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    expect(sampleForTable(items, 24).sampled).toBe(false);
    expect(sampleForTable([...items, 24], 24).rows).toHaveLength(24);
  });

  it('never divides by zero for a degenerate cap', () => {
    expect(sampleForTable([1, 2, 3], 1)).toStrictEqual({ rows: [1], sampled: true });
    expect(sampleForTable([], 0)).toStrictEqual({ rows: [], sampled: false });
  });
});
