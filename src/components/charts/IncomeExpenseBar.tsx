import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from 'recharts';
import { useFinanceStore } from '@/store/useFinanceStore';
import { subMonths, startOfMonth, format } from 'date-fns';
import { formatCurrency } from '@/utils/formatters';

export function IncomeExpenseBar() {
  const transactions = useFinanceStore((s) => s.transactions);
  const currency = useFinanceStore((s) => s.settings.currency);

  const data = useMemo(() => {
    const now = new Date();
    // Build the last 6 months window
    const months: { key: string; month: string; income: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = startOfMonth(subMonths(now, i));
      months.push({ key: format(m, 'yyyy-MM'), month: format(m, 'MMM'), income: 0, expenses: 0 });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));

    for (const t of transactions) {
      if (t.type !== 'income' && t.type !== 'expense') continue;
      const key = t.date.slice(0, 7);
      const i = idx.get(key);
      if (i === undefined) continue;
      if (t.type === 'income') months[i].income += t.amount;
      else months[i].expenses += t.amount;
    }

    return months;
  }, [transactions]);

  const hasData = data.some((d) => d.income > 0 || d.expenses > 0);
  if (!hasData) return null;

  return (
    <div className="card-elevated rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold">Income vs Expenses</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="barIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16c47f" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
              <linearGradient id="barExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5f7e" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
            <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(124,92,255,0.06)' }}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v) => formatCurrency(Number(v) || 0, currency)}
            />
            <Bar dataKey="income" fill="url(#barIncome)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" fill="url(#barExpense)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-center gap-4">
        <div className="flex items-center gap-1.5 text-xs">
          <div className="bg-grad-success h-2.5 w-2.5 rounded-full" />
          <span className="text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="bg-grad-danger h-2.5 w-2.5 rounded-full" />
          <span className="text-muted-foreground">Expenses</span>
        </div>
      </div>
    </div>
  );
}
