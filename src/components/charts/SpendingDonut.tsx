import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinanceStore } from '@/store/useFinanceStore';
import { getCurrentMonthTransactions } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

export function SpendingDonut() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const currency = useFinanceStore((s) => s.settings.currency);

  const data = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const monthTxns = getCurrentMonthTransactions(transactions).filter((t) => t.type === 'expense');
    const byCategory = new Map<string, number>();

    for (const tx of monthTxns) {
      byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount);
    }

    return Array.from(byCategory.entries())
      .map(([catId, amount]) => {
        const cat = catMap.get(catId);
        return { name: cat?.name ?? 'Other', value: amount, color: cat?.color ?? '#94a3b8' };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions, categories]);

  if (data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="card-elevated rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold">Spending by Category</h3>
      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={62}
                dataKey="value"
                strokeWidth={2}
                stroke="var(--card)"
                paddingAngle={2}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v) => formatCurrency(Number(v) || 0, currency)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-muted-foreground text-[10px]">Total</span>
            <span className="text-sm font-bold">{formatCurrency(total, currency, true)}</span>
          </div>
        </div>
        <div className="scrollbar-hide max-h-36 flex-1 space-y-1.5 overflow-y-auto">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground max-w-[100px] truncate">{item.name}</span>
              </div>
              <span className="ml-2 font-medium">{formatCurrency(item.value, currency, true)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
