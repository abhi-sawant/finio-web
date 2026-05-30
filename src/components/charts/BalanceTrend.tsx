import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useFinanceStore } from '@/store/useFinanceStore';
import { subDays, format, differenceInDays, startOfMonth, addMonths } from 'date-fns';
import { formatCurrency } from '@/utils/formatters';

interface Props {
  from: Date;
  to: Date;
}

export function BalanceTrend({ from, to }: Props) {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const currency = useFinanceStore((s) => s.settings.currency);

  const data = useMemo(() => {
    const today = new Date();
    const currentBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Build daily delta map from ALL transactions for accurate balance reconstruction.
    const dayDelta = new Map<string, number>();
    for (const t of transactions) {
      if (t.type === 'transfer') continue;
      const key = t.date.slice(0, 10);
      const delta = t.type === 'income' ? t.amount : -t.amount;
      dayDelta.set(key, (dayDelta.get(key) ?? 0) + delta);
    }

    const numDays = differenceInDays(to, from);

    if (numDays > 90) {
      // Monthly granularity: walk back month by month
      const daysFromToday = differenceInDays(today, from);
      let balance = currentBalance;
      const allDaily: { dateKey: string; balance: number }[] = [];

      for (let i = 0; i <= daysFromToday; i++) {
        const day = subDays(today, i);
        const dayKey = format(day, 'yyyy-MM-dd');
        allDaily.unshift({ dateKey: dayKey, balance });
        balance -= dayDelta.get(dayKey) ?? 0;
      }

      // Sample first day of each month within [from, to]
      const monthly: { date: string; balance: number }[] = [];
      let cursor = startOfMonth(from);
      while (cursor <= to) {
        const key = format(cursor, 'yyyy-MM-dd');
        const point = allDaily.find((p) => p.dateKey >= key);
        if (point) monthly.push({ date: format(cursor, 'MMM yy'), balance: point.balance });
        cursor = addMonths(cursor, 1);
      }
      // Always include the 'to' endpoint
      const lastKey = format(to, 'yyyy-MM-dd');
      const lastPoint = allDaily.findLast ? allDaily.findLast((p) => p.dateKey <= lastKey) : [...allDaily].reverse().find((p) => p.dateKey <= lastKey);
      if (lastPoint) monthly.push({ date: format(to, 'MMM yy'), balance: lastPoint.balance });
      return monthly;
    }

    // Daily granularity: reconstruct from today back to 'from'
    const daysFromToday = differenceInDays(today, from);
    let balance = currentBalance;
    const points: { dateKey: string; date: string; balance: number }[] = [];

    for (let i = 0; i <= daysFromToday; i++) {
      const day = subDays(today, i);
      const dayKey = format(day, 'yyyy-MM-dd');
      points.unshift({ dateKey: dayKey, date: format(day, 'dd MMM'), balance });
      balance -= dayDelta.get(dayKey) ?? 0;
    }

    const fromKey = format(from, 'yyyy-MM-dd');
    const toKey = format(to, 'yyyy-MM-dd');
    return points
      .filter((p) => p.dateKey >= fromKey && p.dateKey <= toKey)
      .map(({ date, balance }) => ({ date, balance }));
  }, [transactions, accounts, from, to]);

  const numDays = differenceInDays(to, from);
  const xAxisInterval = numDays <= 31 ? 4 : numDays <= 60 ? 9 : 'preserveStartEnd';

  const hasData = accounts.length > 0;
  if (!hasData) return null;

  return (
    <div className="card-elevated rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold">Balance Trend</h3>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balanceStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7c5cff" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
            <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} interval={xAxisInterval} />
            <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              cursor={{ stroke: 'rgba(124,92,255,0.25)', strokeWidth: 1 }}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v) => formatCurrency(Number(v) || 0, currency)}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="url(#balanceStroke)"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
