import { formatCurrency } from '@/utils/formatters';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { Account } from '@/types';
import {
  Trash2, Landmark, PiggyBank, Banknote, CreditCard,
  TrendingUp, Wallet, Coins, Building2, Briefcase, Home,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'landmark': Landmark,
  'piggy-bank': PiggyBank,
  'banknote': Banknote,
  'credit-card': CreditCard,
  'trending-up': TrendingUp,
  'wallet': Wallet,
  'coins': Coins,
  'building-2': Building2,
  'briefcase': Briefcase,
  'home': Home,
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

export function AccountCard({ account, variant = 'horizontal', onClick, onDelete }: AccountCardProps) {
  const currency = useFinanceStore((s) => s.settings.currency);

  const isCredit = account.type === 'credit';
  const utilization = isCredit && account.creditLimit
    ? Math.abs(Math.min(account.balance, 0)) / account.creditLimit
    : 0;

  if (variant === 'grid') {
    return (
      <div
        className="relative rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all group overflow-hidden card-elevated"
        onClick={onClick}
        style={{ backgroundImage: `linear-gradient(135deg, ${account.color}22, ${account.color}08)` }}
      >
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={12} className="text-destructive" />
          </button>
        )}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shadow"
            style={{ backgroundImage: `linear-gradient(135deg, ${account.color}, ${account.color}cc)` }}
          >
            <AccountIcon icon={account.icon} size={16} color="#fff" />
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{account.type}</span>
        </div>
        <p className="text-sm font-medium truncate mb-1">{account.name}</p>
        <p className={`text-base font-bold ${account.balance < 0 ? 'text-rose-500' : ''}`}>
          {formatCurrency(account.balance, currency, true)}
        </p>
        {isCredit && account.creditLimit && (
          <div className="mt-2">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
            <p className="text-[10px] text-muted-foreground mt-1">
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
      className="min-w-[180px] rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all shrink-0 card-elevated overflow-hidden relative"
      onClick={onClick}
      style={{ backgroundImage: `linear-gradient(135deg, ${account.color}22, ${account.color}08)` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shadow"
          style={{ backgroundImage: `linear-gradient(135deg, ${account.color}, ${account.color}cc)` }}
        >
          <AccountIcon icon={account.icon} size={14} color="#fff" />
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{account.type}</span>
      </div>
      <p className="text-sm font-medium truncate">{account.name}</p>
      <p className={`text-base font-bold mt-0.5 ${account.balance < 0 ? 'text-rose-500' : ''}`}>
        {formatCurrency(account.balance, currency, true)}
      </p>
    </div>
  );
}
