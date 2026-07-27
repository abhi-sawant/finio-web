import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { buildSpendingCalendar, type CalendarDay } from '@/utils/analytics';
import { normalizeMonthStartDay, periodRange, shiftPeriod } from '@/utils/period';
import { ChartDataTable } from '@/components/charts/ChartDataTable';

/** Monday-first, matching `WEEK_STARTS_ON`. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Past a bit over half strength the fill is dark enough that white reads better than ink. */
const LIGHT_TEXT_INTENSITY = 0.55;

function dayClasses(day: CalendarDay): string {
  if (!day.inRange) return 'opacity-0';
  if (day.isFuture) return 'bg-muted/30 text-muted-foreground/40';
  if (day.total === 0) return 'bg-muted/50 text-muted-foreground';
  return day.intensity >= LIGHT_TEXT_INTENSITY ? 'text-white' : 'text-foreground';
}

export function SpendingHeatmap() {
  const transactions = useFinanceStore((s) => s.transactions);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  // 0 is the financial month in progress; negative steps walk backwards through history.
  const [offset, setOffset] = useState(0);

  const calendar = useMemo(() => {
    const current = periodRange('monthly', new Date(), monthStartDay);
    return buildSpendingCalendar(
      transactions,
      offset === 0 ? current : shiftPeriod(current, offset),
    );
  }, [transactions, offset, monthStartDay]);

  const money = (value: number) => formatCurrency(value, true, hideAmounts);

  // Quiet days would be most of the table and none of the information.
  const spendingDays = useMemo(
    () => calendar.weeks.flat().filter((day) => day.inRange && day.total > 0),
    [calendar],
  );

  return (
    <section className="card-elevated rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Spending Calendar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-28 text-center text-xs font-medium">{calendar.label}</span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Capped on desktop: stretched across a wide card the squares become absurdly large. */}
      <div className="mx-auto w-full max-w-md">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((label, index) => (
            <span
              key={index}
              className="text-muted-foreground text-center text-[10px] font-medium"
              aria-hidden
            >
              {label}
            </span>
          ))}
        </div>

        <div className="space-y-1">
          {calendar.weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <div
                  key={day.key}
                  // A day is both shaded and labelled with its date, so intensity is never the
                  // only way to read the grid.
                  title={
                    day.inRange
                      ? `${format(day.date, 'd MMM')} — ${money(day.total)}${day.transactionCount > 0 ? ` (${day.transactionCount})` : ''}`
                      : undefined
                  }
                  aria-hidden={!day.inRange}
                  className={`relative flex aspect-square items-center justify-center rounded-md text-[10px] font-medium ${dayClasses(day)} ${day.isToday ? 'ring-primary ring-2' : ''}`}
                  style={
                    day.inRange && day.total > 0 && !day.isFuture
                      ? {
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(day.intensity * 100)}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span aria-hidden>{day.inRange ? format(day.date, 'd') : ''}</span>
                  {day.inRange && (
                    // `title` is mouse-only, so the same sentence goes to assistive tech.
                    <span className="sr-only">
                      {format(day.date, 'd MMM')}
                      {day.isFuture
                        ? ', upcoming'
                        : `, ${day.total > 0 ? money(day.total) : 'nothing'} spent`}
                      {day.transactionCount > 0
                        ? ` across ${day.transactionCount} transaction${day.transactionCount === 1 ? '' : 's'}`
                        : ''}
                      {day.isToday ? ', today' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">Total</dt>
          <dd className="text-xs font-semibold">{money(calendar.total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
            Avg / spend day
          </dt>
          <dd className="text-xs font-semibold">{money(calendar.averagePerActiveDay)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">Busiest</dt>
          <dd className="text-xs font-semibold">
            {calendar.busiest ? (
              <>
                {format(calendar.busiest.date, 'd MMM')}{' '}
                <span className="text-muted-foreground font-normal">
                  {money(calendar.busiest.total)}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {calendar.daysWithSpend === 0 && (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          No spending recorded in this period.
        </p>
      )}

      <ChartDataTable
        caption="Days with spending in this period"
        columns={['Day', 'Spent', 'Transactions']}
        rows={spendingDays.map((day) => ({
          key: day.key,
          cells: [format(day.date, 'd MMM'), money(day.total), day.transactionCount],
        }))}
      />
    </section>
  );
}
