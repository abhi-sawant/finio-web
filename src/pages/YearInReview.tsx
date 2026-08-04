import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { buildYearInReview } from '@/utils/analytics';
import { normalizeMonthStartDay } from '@/utils/period';
import { formatCurrency, formatDate, formatPercentChange, shouldCompactGroup } from '@/utils/formatters';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
import { Button } from '@/components/ui/button';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

function ratio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** For spending, up is bad; for income and net, up is good. */
function ChangeBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-muted-foreground text-xs">new this year</span>;
  const isGood = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  if (Math.round(value * 100) === 0) {
    return <span className="text-muted-foreground text-xs">flat vs last year</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}
    >
      <Icon size={11} />
      {formatPercentChange(value).replace('+', '')} vs last year
    </span>
  );
}

export default function YearInReview() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  // 0 is the financial year in progress; negative steps walk backwards through history.
  const [yearOffset, setYearOffset] = useState(0);

  const review = useMemo(
    () => buildYearInReview({ transactions, accounts, monthStartDay, yearOffset }),
    [transactions, accounts, monthStartDay, yearOffset],
  );

  const money = (value: number) => formatCurrency(value, true, hideAmounts);
  const categoryFor = (id: string) => categories.find((c) => c.id === id);
  const heroCompact = useMemo(
    () => shouldCompactGroup([review.current.income, review.current.expenses, review.current.net]),
    [review],
  );
  const busiestExpenses = review.busiestMonth?.expenses ?? 0;

  if (review.current.transactionCount === 0 && review.previous.transactionCount === 0) {
    return (
      <>
        <Header innerClassName="lg:max-w-2xl">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-base font-semibold">Year in Review</h1>
        </Header>
        <Main className="lg:max-w-2xl">
          <p className="text-muted-foreground py-12 text-center text-sm">
            Add some transactions to see a year in review.
          </p>
        </Main>
      </>
    );
  }

  return (
    <>
      <Header innerClassName="lg:max-w-2xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Year in Review</h1>
        <HideAmountsToggle />
      </Header>

      <Main className="lg:max-w-2xl">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setYearOffset((o) => o - 1)}
            className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            aria-label="Previous year"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-20 text-center text-lg font-bold">{review.label}</span>
          <button
            onClick={() => setYearOffset((o) => Math.min(0, o + 1))}
            disabled={yearOffset >= 0}
            className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            aria-label="Next year"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Hero */}
        <div className="card-elevated bg-grad-surface rounded-2xl p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Income</p>
              <p className="text-sm font-semibold text-emerald-500">
                {formatCurrency(review.current.income, true, hideAmounts, {
                  forceCompact: heroCompact,
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Expenses
              </p>
              <p className="text-sm font-semibold text-rose-500">
                {formatCurrency(review.current.expenses, true, hideAmounts, {
                  forceCompact: heroCompact,
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Net</p>
              <p
                className={`text-sm font-semibold ${review.current.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
              >
                {formatCurrency(review.current.net, true, hideAmounts, {
                  forceCompact: heroCompact,
                })}
              </p>
            </div>
          </div>
          <div className="border-border mt-3 grid grid-cols-3 gap-3 border-t pt-2 text-center">
            <ChangeBadge value={ratio(review.current.income, review.previous.income)} />
            <ChangeBadge
              value={ratio(review.current.expenses, review.previous.expenses)}
              invert
            />
            <ChangeBadge value={ratio(review.current.net, review.previous.net)} />
          </div>
        </div>

        {/* Net worth */}
        <div className="card-elevated rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold">Net Worth</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Start of year
              </p>
              <p className="text-sm font-semibold">{money(review.netWorthStart)}</p>
            </div>
            <ArrowRight size={16} className="text-muted-foreground shrink-0" />
            <div className="text-right">
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {yearOffset === 0 ? 'Now' : 'End of year'}
              </p>
              <p className="text-sm font-semibold">{money(review.netWorthEnd)}</p>
            </div>
          </div>
          <p
            className={`mt-2 text-center text-xs font-medium ${review.netWorthChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
          >
            {review.netWorthChange >= 0 ? '+' : ''}
            {money(review.netWorthChange)} this year
          </p>
        </div>

        {/* Monthly breakdown */}
        <div className="card-elevated rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold">Spending by Month</h3>
          <div className="flex items-end gap-1.5" style={{ height: 90 }}>
            {review.monthlyBreakdown.map((month) => (
              <div key={month.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  title={`${month.label}: ${money(month.expenses)}`}
                  className={`w-full rounded-t-sm ${
                    month.key === review.busiestMonth?.key ? 'bg-primary' : 'bg-primary/25'
                  }`}
                  style={{
                    height:
                      busiestExpenses > 0
                        ? `${Math.max(4, (month.expenses / busiestExpenses) * 72)}px`
                        : 4,
                  }}
                />
                <span className="text-muted-foreground text-[9px]">{month.label}</span>
              </div>
            ))}
          </div>
          {review.busiestMonth && (
            <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1 text-xs">
              <Trophy size={12} className="text-amber-500" />
              Biggest spend: {review.busiestMonth.label} · {money(review.busiestMonth.expenses)}
            </p>
          )}
        </div>

        {/* Top categories */}
        {review.topCategories.length > 0 && (
          <div className="card-elevated rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-semibold">Top Categories</h3>
            <ul className="space-y-2.5">
              {review.topCategories.map((c) => {
                const category = categoryFor(c.categoryId);
                return (
                  <li key={c.categoryId} className="flex items-center gap-2.5">
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
                    <span className="shrink-0 text-xs font-semibold">{money(c.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Biggest movers */}
        {review.movers.length > 0 && (
          <div className="card-elevated rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-semibold">Biggest Movers vs Last Year</h3>
            <ul className="space-y-2.5">
              {review.movers.map((mover) => {
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
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Biggest single expense */}
        {review.biggestExpense && (
          <div className="card-elevated rounded-2xl p-4">
            <h3 className="mb-2 text-sm font-semibold">Biggest Single Expense</h3>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {review.biggestExpense.note || categoryFor(review.biggestExpense.categoryId)?.name || 'Expense'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(review.biggestExpense.date)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-rose-500">
                {money(review.biggestExpense.amount)}
              </p>
            </div>
          </div>
        )}

        <p className="text-muted-foreground pb-2 text-center text-xs">
          {review.current.transactionCount} transaction
          {review.current.transactionCount === 1 ? '' : 's'} this year
        </p>
      </Main>
    </>
  );
}
