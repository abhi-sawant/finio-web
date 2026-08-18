import { memo } from 'react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { getCreditCardDueInfo, getCreditUtilization } from '@/utils/calculations';
import { cn } from '@/lib/utils';
import type { Account } from '@/types';
import { Trash2, Archive } from 'lucide-react';

function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    return `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${daysUntilDue} days`;
}

interface AccountCardProps {
  account: Account;
  onClick?: () => void;
  onDelete?: () => void;
  /** Closes an open account, or reopens an archived one. */
  onToggleArchive?: () => void;
  /** Shown in the "Closed · N transactions" caption for an archived account. */
  transactionCount?: number;
  /**
   * Forces the balance to render compact regardless of its own magnitude. Callers rendering a
   * *group* of rows should compute this once for the whole group (see `shouldCompactGroup`) so
   * balances shown together never mix notations — otherwise each balance decides alone.
   */
  forceCompact?: boolean;
}

/** A single hairline row — paired with a sibling row inside a `card-elevated divide-y` list. */
export const AccountCard = memo(function AccountCard({
  account,
  onClick,
  onDelete,
  onToggleArchive,
  transactionCount = 0,
  forceCompact = false,
}: AccountCardProps) {
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const isCredit = account.type === 'credit';
  const isArchived = !!account.archivedAt;
  const utilization = getCreditUtilization(account);
  const dueInfo = getCreditCardDueInfo(account);

  return (
    <div className="group flex w-full items-center gap-2 py-3">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {isArchived
              ? `Closed · ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}`
              : account.type}
          </p>
          {dueInfo && (
            <p
              className={cn(
                'mt-0.5 text-[11px] font-medium',
                dueInfo.isOverdue ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {dueLabel(dueInfo.daysUntilDue)} · Min{' '}
              {formatCurrency(dueInfo.minimumDue, true, hideAmounts)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-sm font-semibold', account.balance < 0 && 'text-destructive')}>
            {formatCurrency(account.balance, true, hideAmounts, { forceCompact })}
          </p>
          {isCredit && account.creditLimit && (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {Math.round(utilization * 100)}% used
            </p>
          )}
        </div>
      </button>
      {isArchived && onToggleArchive && (
        <button
          onClick={onToggleArchive}
          className="text-primary shrink-0 text-xs font-medium hover:underline"
        >
          Reopen
        </button>
      )}
      {!isArchived && (onToggleArchive || onDelete) && (
        <div className="flex shrink-0 gap-1">
          {onToggleArchive && (
            <button
              onClick={onToggleArchive}
              className="border-border bg-card hover:bg-muted flex h-7 w-7 items-center justify-center rounded-full border"
              aria-label={`Archive ${account.name}`}
            >
              <Archive size={12} className="text-muted-foreground" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="border-border bg-card hover:bg-muted flex h-7 w-7 items-center justify-center rounded-full border"
              aria-label={`Delete ${account.name}`}
            >
              <Trash2 size={12} className="text-destructive" />
            </button>
          )}
        </div>
      )}
      {isArchived && onDelete && (
        <button
          onClick={onDelete}
          className="border-border bg-card hover:bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
          aria-label={`Delete ${account.name}`}
        >
          <Trash2 size={12} className="text-destructive" />
        </button>
      )}
    </div>
  );
});
