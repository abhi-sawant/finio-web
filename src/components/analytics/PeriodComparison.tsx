import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatPercentChange } from '@/utils/formatters';
import { buildPeriodComparison, categoryMovements, type PeriodSummary } from '@/utils/analytics';
import {
  PERIOD_TYPES,
  PERIOD_LABELS,
  normalizeMonthStartDay,
  type PeriodType,
} from '@/utils/period';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { Button } from '@/components/ui/button';

/** Column headings per period type — "last week" reads better than repeating the date range. */
const COLUMN_LABELS: Record<PeriodType, [string, string, string]> = {
  weekly: ['This week', 'Last week', 'Same week last year'],
  monthly: ['This month', 'Last month', 'Same month last year'],
  yearly: ['This year', 'Last year', ''],
};

function ChangeBadge({ ratio, invert = false }: { ratio: number | null; invert?: boolean }) {
  if (ratio === null) {
    return <span className="text-muted-foreground text-[10px]">—</span>;
  }
  const pct = Math.round(ratio * 100);
  if (pct === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]">
        <Minus size={9} /> flat
      </span>
    );
  }
  // For spending, up is bad; for income and net, up is good.
  const isGood = invert ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}
    >
      <Icon size={9} />
      {formatPercentChange(ratio).replace('+', '')}
    </span>
  );
}

function ratio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function PeriodComparison() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  const [type, setType] = useState<PeriodType>('monthly');

  const comparison = useMemo(
    () => buildPeriodComparison(transactions, { type, monthStartDay }),
    [transactions, type, monthStartDay],
  );

  // Destructured first: a dependency literally named `current` reads as a ref to the lint rules.
  const { current: thisPeriod, previous: lastPeriod } = comparison;
  const movers = useMemo(
    () => categoryMovements(thisPeriod, lastPeriod, 5),
    [thisPeriod, lastPeriod],
  );

  const [currentLabel, previousLabel, lastYearLabel] = COLUMN_LABELS[type];
  const columns: Array<{ heading: string; summary: PeriodSummary }> = [
    { heading: currentLabel, summary: comparison.current },
    { heading: previousLabel, summary: comparison.previous },
  ];
  // A year of history the user doesn't have would just be a column of zeros.
  if (comparison.lastYear && comparison.lastYear.transactionCount > 0) {
    columns.push({ heading: lastYearLabel, summary: comparison.lastYear });
  }

  const money = (value: number) => formatCurrency(value, true, hideAmounts);
  const categoryFor = (id: string) => categories.find((c) => c.id === id);

  if (comparison.current.transactionCount === 0 && comparison.previous.transactionCount === 0) {
    return null;
  }

  return (
    <section className="card-elevated rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Compare Periods</h3>
        <div className="flex gap-1">
          {PERIOD_TYPES.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={type === option ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setType(option)}
            >
              {PERIOD_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(({ heading, summary }, index) => {
          const base = index === 0 ? null : comparison.current;
          return (
            <div key={heading} className="bg-muted/40 rounded-xl p-3">
              <p className="text-muted-foreground truncate text-[10px] tracking-wide uppercase">
                {heading}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-[10px]">{summary.label}</p>

              <dl className="mt-2 space-y-1.5">
                <div>
                  <dt className="text-muted-foreground text-[10px]">Income</dt>
                  <dd className="text-xs font-semibold text-emerald-500">
                    {money(summary.income)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[10px]">Expenses</dt>
                  <dd className="text-xs font-semibold text-rose-500">{money(summary.expenses)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[10px]">Net</dt>
                  <dd
                    className={`text-xs font-semibold ${summary.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {money(summary.net)}
                  </dd>
                </div>
              </dl>

              {/* How the period in progress compares against this one, not the reverse. */}
              {base && (
                <p className="mt-2 flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground">spend now:</span>
                  <ChangeBadge ratio={ratio(base.expenses, summary.expenses)} invert />
                </p>
              )}
            </div>
          );
        })}
      </div>

      {comparison.current.isPartial && (
        <p className="text-muted-foreground mt-2 text-[10px]">
          {currentLabel.toLowerCase()} is still in progress — on pace for{' '}
          {money(comparison.current.projectedExpenses)} of spending.
        </p>
      )}

      {movers.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-2 text-[10px] tracking-wide uppercase">
            Biggest movers vs {previousLabel.toLowerCase()}
          </p>
          <ul className="space-y-2">
            {movers.map((mover) => {
              const category = categoryFor(mover.categoryId);
              const isUp = mover.change > 0;
              return (
                <li key={mover.categoryId} className="flex items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${category?.color ?? '#94a3b8'}, ${category?.color ?? '#94a3b8'}cc)`,
                    }}
                  >
                    <CategoryIcon
                      icon={category?.icon ?? 'circle-ellipsis'}
                      size={13}
                      color="white"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {category?.name ?? 'Uncategorized'}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold ${isUp ? 'text-rose-500' : 'text-emerald-500'}`}
                  >
                    {isUp ? '+' : '−'}
                    {money(Math.abs(mover.change))}
                  </span>
                  <span className="w-12 shrink-0 text-right">
                    <ChangeBadge ratio={mover.percentChange} invert />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
