import { memo } from 'react';
import { formatCurrency } from '@/utils/formatters';
import { useCurrency } from '@/store/useFinanceStore';
import type { Account } from '@/types';
import {
  Trash2,
  Landmark,
  PiggyBank,
  Banknote,
  CreditCard,
  TrendingUp,
  Wallet,
  Coins,
  Building2,
  Briefcase,
  Home,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  banknote: Banknote,
  'credit-card': CreditCard,
  'trending-up': TrendingUp,
  wallet: Wallet,
  coins: Coins,
  'building-2': Building2,
  briefcase: Briefcase,
  home: Home,
};

function AccountIcon({ icon, size = 16, color }: { icon: string; size?: number; color?: string }) {
  const Icon = ICON_MAP[icon];
  if (Icon) return <Icon size={size} style={{ color }} />;
  // Fallback: treat as emoji or text
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

interface AccountCardProps {
  account: Account;
  variant?: 'horizontal' | 'grid';
  onClick?: () => void;
  onDelete?: () => void;
}

export const AccountCard = memo(function AccountCard({
  account,
  variant = 'horizontal',
  onClick,
  onDelete,
}: AccountCardProps) {
  const currency = useCurrency();

  const isCredit = account.type === 'credit';
  const utilization =
    isCredit && account.creditLimit
      ? Math.abs(Math.min(account.balance, 0)) / account.creditLimit
      : 0;

  if (variant === 'grid') {
    return (
      <div
        className="group card-elevated relative cursor-pointer overflow-hidden rounded-2xl p-4 transition-all active:scale-[0.98]"
        onClick={onClick}
        style={{
          backgroundImage: `linear-gradient(135deg, ${account.color}22, ${account.color}08)`,
        }}
      >
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="bg-destructive/10 absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Trash2 size={12} className="text-destructive" />
          </button>
        )}
        <div className="mb-2 flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full shadow"
            style={{
              backgroundImage: `linear-gradient(135deg, ${account.color}, ${account.color}cc)`,
            }}
          >
            <AccountIcon icon={account.icon} size={16} color="#fff" />
          </div>
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {account.type}
          </span>
        </div>
        <p className="mb-1 truncate text-sm font-medium">{account.name}</p>
        <p className={`text-base font-bold ${account.balance < 0 ? 'text-rose-500' : ''}`}>
          {formatCurrency(account.balance, currency, true)}
        </p>
        {isCredit && account.creditLimit && (
          <div className="mt-2">
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(utilization * 100, 100)}%`,
                  backgroundImage:
                    utilization > 0.8
                      ? 'linear-gradient(90deg,#ef4444,#ff5f7e)'
                      : utilization > 0.5
                        ? 'linear-gradient(90deg,#f59e0b,#fb923c)'
                        : 'linear-gradient(90deg,#22c55e,#16c47f)',
                }}
              />
            </div>
            <p className="text-muted-foreground mt-1 text-[10px]">
              {Math.round(utilization * 100)}% used
            </p>
          </div>
        )}
      </div>
    );
  }

  // Horizontal variant (for dashboard scroll)
  return (
    <div
      className="card-elevated relative min-w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-2xl p-4 transition-all active:scale-[0.98]"
      onClick={onClick}
      style={{ backgroundImage: `linear-gradient(135deg, ${account.color}22, ${account.color}08)` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full shadow"
          style={{
            backgroundImage: `linear-gradient(135deg, ${account.color}, ${account.color}cc)`,
          }}
        >
          <AccountIcon icon={account.icon} size={14} color="#fff" />
        </div>
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {account.type}
        </span>
      </div>
      <p className="truncate text-sm font-medium">{account.name}</p>
      <p className={`mt-0.5 text-base font-bold ${account.balance < 0 ? 'text-rose-500' : ''}`}>
        {formatCurrency(account.balance, currency, true)}
      </p>
    </div>
  );
});
