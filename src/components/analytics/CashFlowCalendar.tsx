import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, CreditCard } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import {
  buildCashFlowCalendarMonth,
  buildCashFlowForecast,
  type CashFlowCalendarDay,
} from '@/utils/forecast';
import { getCreditCardDueInfo } from '@/utils/calculations';
import { normalizeMonthStartDay, periodRange, shiftPeriod } from '@/utils/period';
import { ChartDataTable } from '@/components/charts/ChartDataTable';

/** Monday-first, matching `WEEK_STARTS_ON`. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** How far forward month navigation may go — comfortably inside the forecast horizon below. */
const MAX_MONTHS_AHEAD = 2;

/** A little past `MAX_MONTHS_AHEAD` of calendar months, so the last visible month is never cut off. */
const FORECAST_DAYS = 100;

function dayClasses(day: CashFlowCalendarDay): string {
  if (!day.inRange) return 'opacity-0';
  if (day.netFlow === 0) return 'bg-muted/50 text-muted-foreground';
  return day.netFlow > 0
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
}

export function CashFlowCalendar() {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const recurring = useFinanceStore((s) => s.recurring);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  // 0 is the current month; positive steps walk forward into the forecast.
  const [offset, setOffset] = useState(0);

  const forecast = useMemo(
    () => buildCashFlowForecast({ accounts, transactions, recurring, days: FORECAST_DAYS }),
    [accounts, transactions, recurring],
  );

  const monthRange = useMemo(() => {
    const current = periodRange('monthly', new Date(), monthStartDay);
    return offset === 0 ? current : shiftPeriod(current, offset);
  }, [offset, monthStartDay]);

  const calendar = useMemo(
    () => buildCashFlowCalendarMonth(forecast.scheduled, monthRange),
    [forecast, monthRange],
  );

  // A credit card's payment due date is a real deadline even when nothing is scheduled to pay
  // it automatically — worth marking on the grid alongside the actual money movements.
  const dueDatesByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const account of accounts) {
      const due = getCreditCardDueInfo(account);
      if (!due) continue;
      const key = format(due.dueDate, 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), account.name]);
    }
    return map;
  }, [accounts]);

  const money = (value: number) => formatCurrency(value, true, hideAmounts);

  const daysWithFlows = useMemo(
    () => calendar.weeks.flat().filter((day) => day.inRange && day.flows.length > 0),
    [calendar],
  );

  if (forecast.isEmpty) return null;

  return (
    <section className="card-elevated rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Cash Flow Calendar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset <= 0}
            className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-20 text-center text-xs font-medium">
            {format(monthRange.start, 'MMM yyyy')}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(MAX_MONTHS_AHEAD, o + 1))}
            disabled={offset >= MAX_MONTHS_AHEAD}
            className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

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
              {week.map((day) => {
                const dueAccounts = dueDatesByDay.get(day.key);
                const title = day.inRange
                  ? [
                      format(day.date, 'd MMM'),
                      day.netFlow !== 0
                        ? `${day.netFlow > 0 ? '+' : ''}${money(day.netFlow)} (${day.flows.map((f) => f.note || 'Untitled').join(', ')})`
                        : 'nothing scheduled',
                      dueAccounts ? `${dueAccounts.join(', ')} payment due` : '',
                    ]
                      .filter(Boolean)
                      .join(' — ')
                  : undefined;

                return (
                  <div
                    key={day.key}
                    title={title}
                    aria-hidden={!day.inRange}
                    className={`relative flex aspect-square items-center justify-center rounded-md text-[10px] font-medium ${dayClasses(day)} ${day.isToday ? 'ring-primary ring-2' : ''}`}
                  >
                    <span aria-hidden>{day.inRange ? format(day.date, 'd') : ''}</span>
                    {dueAccounts && (
                      <CreditCard
                        size={9}
                        className="text-muted-foreground absolute right-0.5 bottom-0.5"
                        aria-hidden
                      />
                    )}
                    {day.inRange && (
                      // `title` is mouse-only, so the same sentence goes to assistive tech.
                      <span className="sr-only">
                        {title}
                        {day.isToday ? ', today' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-center gap-4 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40" /> Money in
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/40" /> Money out
        </span>
        <span className="flex items-center gap-1">
          <CreditCard size={10} /> Card due
        </span>
      </div>

      {daysWithFlows.length === 0 && (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Nothing scheduled to land this month.
        </p>
      )}

      <ChartDataTable
        caption="Scheduled cash flow this month"
        columns={['Day', 'Net', 'Details']}
        rows={daysWithFlows.map((day) => ({
          key: day.key,
          cells: [
            format(day.date, 'd MMM'),
            money(day.netFlow),
            day.flows.map((f) => f.note || 'Untitled').join(', '),
          ],
        }))}
      />
    </section>
  );
}
