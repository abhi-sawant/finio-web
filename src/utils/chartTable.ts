/**
 * Helpers for the data-table fallback that sits under every chart
 * ([`ChartDataTable`](src/components/charts/ChartDataTable.tsx)).
 */

/**
 * Evenly-spaced sample of a long series, always keeping the first and last points — a 90-day
 * daily forecast is a wall of rows otherwise. Returns the input untouched when it already fits,
 * and reports whether it thinned anything so the caller can say so in the caption.
 */
export function sampleForTable<T>(items: T[], max = 24): { rows: T[]; sampled: boolean } {
  if (max < 2) return { rows: items.slice(0, Math.max(max, 0)), sampled: items.length > max };
  if (items.length <= max) return { rows: items, sampled: false };

  const step = (items.length - 1) / (max - 1);
  const rows: T[] = [];
  for (let i = 0; i < max; i += 1) {
    rows.push(items[Math.round(i * step)]);
  }
  return { rows, sampled: true };
}
