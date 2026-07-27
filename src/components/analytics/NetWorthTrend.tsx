import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Camera, TrendingDown, TrendingUp } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatPercentChange } from '@/utils/formatters';
import { buildNetWorthSeries } from '@/utils/netWorth';
import { normalizeMonthStartDay } from '@/utils/period';
import { Button } from '@/components/ui/button';
import { ChartDataTable } from '@/components/charts/ChartDataTable';

const RANGES = [
  { months: 6, label: '6m' },
  { months: 12, label: '12m' },
  { months: 24, label: '24m' },
] as const;

export function NetWorthTrend() {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const snapshots = useFinanceStore((s) => s.netWorthSnapshots);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  const [months, setMonths] = useState<number>(12);

  const series = useMemo(
    () => buildNetWorthSeries({ accounts, transactions, snapshots, months, monthStartDay }),
    [accounts, transactions, snapshots, months, monthStartDay],
  );

  const chartData = useMemo(
    () =>
      series.map((point) => ({
        month: format(point.date, 'MMM yy'),
        'Net worth': point.netWorth,
        Assets: point.assets,
        Liabilities: point.liabilities === 0 ? 0 : -point.liabilities,
      })),
    [series],
  );

  const money = (value: number) => formatCurrency(value, true, hideAmounts);

  const latest = series[series.length - 1];
  const earliest = series[0];
  const change = latest && earliest ? latest.netWorth - earliest.netWorth : 0;
  const changeRatio =
    earliest && earliest.netWorth !== 0 ? change / Math.abs(earliest.netWorth) : null;
  const snapshotCount = series.filter((p) => p.source === 'snapshot').length;

  if (accounts.length === 0) return null;

  return (
    <section className="card-elevated rounded-2xl p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Net Worth Over Time</h3>
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <Button
              key={range.months}
              size="sm"
              variant={months === range.months ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setMonths(range.months)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-bold">{latest ? money(latest.netWorth) : '—'}</span>
        {change !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}
          >
            {change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {money(Math.abs(change))}
            {changeRatio !== null && <> ({formatPercentChange(changeRatio)})</>}
          </span>
        )}
        <span className="text-muted-foreground text-[10px]">over {months} months</span>
      </div>

      <div
        className="h-44 lg:h-64"
        role="img"
        aria-label={`Net worth by month${latest ? `, currently ${money(latest.netWorth)}` : ''}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
            <XAxis
              dataKey="month"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              cursor={{ fill: 'rgba(124,92,255,0.08)' }}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v) => formatCurrency(Math.abs(Number(v) || 0), false, hideAmounts)}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            {/* Assets up, liabilities down, net worth as the line that sums them. */}
            <Bar dataKey="Assets" fill="#16c47f" opacity={0.55} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Liabilities" fill="#ff5f7e" opacity={0.55} radius={[0, 0, 4, 4]} />
            <Line
              type="monotone"
              dataKey="Net worth"
              stroke="#7c5cff"
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption="Net worth, assets and liabilities by month"
        columns={['Month', 'Net worth', 'Assets', 'Liabilities']}
        rows={series.map((point) => ({
          key: point.key,
          cells: [
            format(point.date, 'MMM yy'),
            money(point.netWorth),
            money(point.assets),
            money(point.liabilities),
          ],
        }))}
      />

      <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-[10px]">
        <Camera size={11} className="mt-0.5 shrink-0" />
        <span>
          {snapshotCount > 0
            ? `${snapshotCount} of these months ${snapshotCount === 1 ? 'is a' : 'are'} saved snapshot${snapshotCount === 1 ? '' : 's'} — editing old transactions won't rewrite them. `
            : ''}
          Months without a snapshot are reconstructed from your current history.
        </span>
      </p>
    </section>
  );
}
