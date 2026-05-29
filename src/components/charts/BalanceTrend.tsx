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
import { subDays, format } from 'date-fns';
import { formatCurrency } from '@/utils/formatters';

export function BalanceTrend() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const currency = useFinanceStore((s) => s.settings.currency);

  const data = useMemo(() => {
    const now = new Date();
    const currentBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Bucket transaction deltas by day (income +, expense -, transfer = 0 net).
    const dayDelta = new Map<string, number>();
    for (const t of transactions) {
      if (t.type === 'transfer') continue;
      const key = t.date.slice(0, 10);
      const delta = t.type === 'income' ? t.amount : -t.amount;
      dayDelta.set(key, (dayDelta.get(key) ?? 0) + delta);
    }

    let balance = currentBalance;
    const points: { date: string; balance: number }[] = [];
    for (let i = 0; i <= 30; i++) {
      const day = subDays(now, i);
      const dayKey = format(day, 'yyyy-MM-dd');
      points.unshift({ date: format(day, 'dd MMM'), balance });
      const delta = dayDelta.get(dayKey) ?? 0;
      // Reverse this day's delta to get previous day's closing balance.
      balance -= delta;
    }
    return points;
  }, [transactions, accounts]);

  const hasData = accounts.length > 0;
  if (!hasData) return null;

  return (
    <div className="card-elevated rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold">30-Day Balance Trend</h3>
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
            <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} interval={5} />
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
