import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, TrendingDown, Wallet } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { buildCashFlowForecast } from '@/utils/forecast';
import { Button } from '@/components/ui/button';

const HORIZONS = [
  { days: 30, label: '30d' },
  { days: 60, label: '60d' },
  { days: 90, label: '90d' },
] as const;

export function CashFlowForecast() {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const recurring = useFinanceStore((s) => s.recurring);
  const categories = useFinanceStore((s) => s.categories);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);

  const [days, setDays] = useState<number>(90);

  const forecast = useMemo(
    () => buildCashFlowForecast({ accounts, transactions, recurring, days }),
    [accounts, transactions, recurring, days],
  );

  const chartData = useMemo(
    () => forecast.points.map((p) => ({ date: format(p.date, 'd MMM'), balance: p.balance })),
    [forecast],
  );

  const money = (value: number) => formatCurrency(value, true, hideAmounts);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  if (forecast.isEmpty) return null;

  const upcoming = forecast.scheduled.slice(0, 4);

  return (
    <section className="card-elevated rounded-2xl p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Cash-Flow Forecast</h3>
        <div className="flex gap-1">
          {HORIZONS.map((horizon) => (
            <Button
              key={horizon.days}
              size="sm"
              variant={days === horizon.days ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setDays(horizon.days)}
            >
              {horizon.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground mb-3 text-[10px]">
        Liquid cash projected from your recurring rules plus your last {forecast.lookbackDays} days
        of everyday spending. Credit cards are excluded until the payment leaves an account.
      </p>

      <div
        className="h-40 lg:h-56"
        role="img"
        aria-label={`Projected balance over the next ${days} days, from ${money(forecast.startBalance)} today to ${money(forecast.endBalance)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
            <XAxis
              dataKey="date"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              cursor={{ stroke: 'rgba(124,92,255,0.25)', strokeWidth: 1 }}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v) => formatCurrency(Number(v) || 0, false, hideAmounts)}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            {/* Zero is the line that matters — everything below it is an overdraft. */}
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#7c5cff"
              strokeWidth={2.5}
              fill="url(#forecastFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="bg-muted/40 rounded-xl p-2.5">
          <dt className="text-muted-foreground flex items-center gap-1 text-[10px] tracking-wide uppercase">
            <Wallet size={10} /> Today
          </dt>
          <dd className="mt-0.5 text-xs font-semibold">{money(forecast.startBalance)}</dd>
        </div>
        <div className="bg-muted/40 rounded-xl p-2.5">
          <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
            In {days} days
          </dt>
          <dd
            className={`mt-0.5 text-xs font-semibold ${forecast.endBalance < 0 ? 'text-rose-500' : ''}`}
          >
            {money(forecast.endBalance)}
          </dd>
        </div>
        <div className="bg-muted/40 rounded-xl p-2.5">
          <dt className="text-muted-foreground flex items-center gap-1 text-[10px] tracking-wide uppercase">
            <TrendingDown size={10} /> Lowest
          </dt>
          <dd
            className={`mt-0.5 text-xs font-semibold ${forecast.low && forecast.low.balance < 0 ? 'text-rose-500' : ''}`}
          >
            {forecast.low ? money(forecast.low.balance) : '—'}
            {forecast.low && (
              <span className="text-muted-foreground ml-1 font-normal">
                {format(forecast.low.date, 'd MMM')}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {forecast.shortfallDate && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-2.5 text-xs text-rose-500">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            At this rate your liquid balance runs out around{' '}
            <strong className="font-semibold">
              {format(forecast.shortfallDate, 'd MMM yyyy')}
            </strong>
            .
          </span>
        </p>
      )}

      {upcoming.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-2 text-[10px] tracking-wide uppercase">
            Scheduled next — {money(forecast.totals.scheduledOut)} out,{' '}
            {money(forecast.totals.scheduledIn)} in over {days} days
          </p>
          <ul className="space-y-1.5">
            {upcoming.map((flow) => (
              <li
                key={`${flow.ruleId}-${flow.date.toISOString()}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-muted-foreground w-14 shrink-0">
                  {format(flow.date, 'd MMM')}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {flow.note || categoryName(flow.categoryId)}
                </span>
                <span
                  className={`shrink-0 font-semibold ${flow.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {flow.delta > 0 ? '+' : '−'}
                  {money(Math.abs(flow.delta))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {forecast.dailyEstimate > 0 && (
        <p className="text-muted-foreground mt-3 text-[10px]">
          Everyday spend estimated at {money(forecast.dailyEstimate)} a day
          {forecast.categoryAverages.length > 0 && (
            <>
              , led by{' '}
              {forecast.categoryAverages
                .slice(0, 3)
                .map((average) => categoryName(average.categoryId))
                .join(', ')}
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}
