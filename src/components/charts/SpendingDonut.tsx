import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinanceStore } from '@/store/useFinanceStore';
import { transactionCategoryAmounts } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';
import type { Transaction } from '@/types';

interface Props {
  transactions: Transaction[];
}

export function SpendingDonut({ transactions }: Props) {
  const categories = useFinanceStore((s) => s.categories);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);

  const data = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const byCategory = new Map<string, number>();

    for (const tx of transactions.filter((t) => t.type === 'expense')) {
      for (const { categoryId, amount } of transactionCategoryAmounts(tx)) {
        byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + amount);
      }
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
      <div className="grid items-center justify-center gap-4">
        {/* The legend below is the text alternative — the ring itself only needs a headline. */}
        <div
          className="relative h-72 w-72"
          role="img"
          aria-label={`Expenses split across ${data.length} categor${
            data.length === 1 ? 'y' : 'ies'
          }, ${formatCurrency(total, true, hideAmounts)} in total. Every category is listed below.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={66}
                outerRadius={112}
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
                formatter={(v) => formatCurrency(Number(v) || 0, false, hideAmounts)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-muted-foreground text-[10px]">Total</span>
            <span className="text-sm font-bold">{formatCurrency(total, true, hideAmounts)}</span>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5 overflow-y-auto">
          {data.map((item) => (
            <li key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground max-w-25 truncate">{item.name}</span>
              </div>
              <span className="ml-2 font-medium">
                {formatCurrency(item.value, true, hideAmounts)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
