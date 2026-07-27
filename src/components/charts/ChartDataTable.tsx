import type { ReactNode } from 'react';
import { ChevronDown, Table2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ChartTableRow {
  key: string;
  /** First cell is the row header (the category, month, date…); the rest are values. */
  cells: ReactNode[];
}

interface ChartDataTableProps {
  /** Describes the table for screen readers, e.g. "Balance by day". */
  caption: string;
  columns: string[];
  rows: ChartTableRow[];
  /** Appended to the caption when the rows are a sample rather than the whole series. */
  note?: string;
  className?: string;
}

/**
 * The numbers behind a chart, as a real table inside a `<details>` disclosure.
 *
 * A `<canvas>`/SVG chart is opaque to a screen reader, and an `aria-label` summary can only
 * say the headline. This is the fallback that carries the actual figures — and because it's a
 * disclosure rather than `sr-only` markup, it's equally reachable by anyone who just wants
 * the numbers instead of the picture.
 */
export function ChartDataTable({ caption, columns, rows, note, className }: ChartDataTableProps) {
  if (rows.length === 0) return null;

  return (
    <details className={cn('group mt-3', className)}>
      <summary className="text-muted-foreground focus-visible:ring-ring/50 inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] font-medium outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
        <Table2 size={12} aria-hidden />
        View data table
        <ChevronDown size={12} aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <caption className="sr-only">{note ? `${caption} — ${note}` : caption}</caption>
          <thead>
            <tr className="text-muted-foreground">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'bg-card sticky top-0 py-1 font-medium',
                    index === 0 ? 'text-left' : 'pl-2 text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-border/60 border-t">
                {row.cells.map((cell, index) =>
                  index === 0 ? (
                    <th
                      key={index}
                      scope="row"
                      className="text-muted-foreground py-1 pr-2 text-left font-normal whitespace-nowrap"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={index} className="py-1 pl-2 text-right font-medium whitespace-nowrap">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
