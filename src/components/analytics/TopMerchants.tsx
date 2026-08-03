import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useFinanceStore } from '@/store/useFinanceStore';
import { topMerchants } from '@/utils/merchants';
import { formatCurrency, shouldCompactGroup } from '@/utils/formatters';
import type { Transaction } from '@/types';

interface Props {
  transactions: Transaction[];
}

const TOP_N = 5;

export function TopMerchants({ transactions }: Props) {
  const navigate = useNavigate();
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);

  const merchants = useMemo(() => topMerchants(transactions, TOP_N), [transactions]);
  const compact = useMemo(() => shouldCompactGroup(merchants.map((m) => m.totalAmount)), [merchants]);

  if (merchants.length === 0) return null;

  const maxAmount = merchants[0].totalAmount;

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Top Merchants</h3>
        <button
          onClick={() => navigate('/merchants')}
          className="text-primary text-xs font-medium hover:underline"
        >
          See all
        </button>
      </div>
      <div className="space-y-3">
        {merchants.map((merchant) => (
          <div key={merchant.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="truncate font-medium">{merchant.displayName}</span>
              <span className="text-muted-foreground shrink-0 pl-2">
                {formatCurrency(merchant.totalAmount, true, hideAmounts, { forceCompact: compact })}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-grad-primary h-full rounded-full"
                style={{ width: `${maxAmount > 0 ? (merchant.totalAmount / maxAmount) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
