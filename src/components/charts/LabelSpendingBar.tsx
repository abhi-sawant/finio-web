import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '@/store/useFinanceStore';
import { getCurrentMonthTransactions } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

export function LabelSpendingBar() {
  const transactions = useFinanceStore((s) => s.transactions);
  const labels = useFinanceStore((s) => s.labels);
  const currency = useFinanceStore((s) => s.settings.currency);

  const data = useMemo(() => {
    const monthTxns = getCurrentMonthTransactions(transactions).filter((t) => t.type === 'expense');
    const byLabel = new Map<string, number>();

    for (const tx of monthTxns) {
      for (const labelId of tx.labels) {
        byLabel.set(labelId, (byLabel.get(labelId) ?? 0) + tx.amount);
      }
    }

    return Array.from(byLabel.entries())
      .map(([labelId, amount]) => {
        const label = labels.find((l) => l.id === labelId);
        return { name: label?.name ?? 'Unknown', amount, color: label?.color ?? '#94a3b8' };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions, labels]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 card-elevated">
      <h3 className="text-sm font-semibold mb-3">Spending by Label</h3>
      <div className="space-y-2">
        {data.map((item) => {
          const maxAmount = data[0]?.amount ?? 1;
          const width = (item.amount / maxAmount) * 100;
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium">{formatCurrency(item.amount, currency, true)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${width}%`,
                    backgroundImage: `linear-gradient(90deg, ${item.color}99, ${item.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
