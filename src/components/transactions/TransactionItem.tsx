import { memo, useRef, useState } from 'react';
import { ArrowLeftRight, Repeat, Copy, BookmarkPlus, CheckSquare, Trash2, Split } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useLongPress } from '@/hooks/useLongPress';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Checkbox } from '@/components/ui/checkbox';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { Transaction, Category, Account, Label } from '@/types';

export type TransactionRowAction = 'select' | 'duplicate' | 'template' | 'delete';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  accounts: Account[];
  /** Renders label chips under the row. Omit on dense lists where it's not worth the row height. */
  labels?: Label[];
  /** Shows the transaction's date instead of nothing — for lists with no date-group header. */
  showDate?: boolean;
  onClick?: () => void;
  /** Enables the long-press row menu (Select / Duplicate / Save as template / Delete). */
  onLongPressAction?: (action: TransactionRowAction, transaction: Transaction) => void;
  /** Bulk-selection mode: shows a checkbox and disables the long-press menu. `onClick` still toggles it. */
  selectionMode?: boolean;
  selected?: boolean;
}

export const TransactionItem = memo(function TransactionItem({
  transaction,
  categories,
  accounts,
  showDate = false,
  onClick,
  onLongPressAction,
  selectionMode = false,
  selected = false,
}: TransactionItemProps) {
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const rowRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { firedRef, handlers: longPressHandlers } = useLongPress(() => setMenuOpen(true));
  const longPressEnabled = !!onLongPressAction && !selectionMode;

  const handleClick = () => {
    if (longPressEnabled && firedRef.current) {
      // Same press/release that opened the menu would otherwise also fire this click.
      firedRef.current = false;
      return;
    }
    onClick?.();
  };

  const handleMenuAction = (action: TransactionRowAction) => {
    setMenuOpen(false);
    onLongPressAction?.(action, transaction);
  };

  const isSplit = !!transaction.splits && transaction.splits.length > 0;
  const isTransfer = transaction.type === 'transfer';
  const category = categories.find((c) => c.id === transaction.categoryId);
  const account = accounts.find((a) => a.id === transaction.accountId);
  const toAccount = transaction.toAccountId
    ? accounts.find((a) => a.id === transaction.toAccountId)
    : undefined;

  const amountColor =
    transaction.type === 'income'
      ? 'text-emerald-500'
      : transaction.type === 'expense'
        ? 'text-rose-500'
        : 'text-sky-500';

  const amountPrefix =
    transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';

  // The sign and the tint are the only visual cue for which way money moved, and a transfer
  // has neither — so name the type for assistive tech.
  const typeLabel =
    transaction.type === 'income'
      ? 'Income'
      : transaction.type === 'expense'
        ? 'Expense'
        : 'Transfer';

  const splitTitle = isSplit
    ? transaction
        .splits!.map((s) => categories.find((c) => c.id === s.categoryId)?.name ?? 'Unknown')
        .join(' + ')
    : undefined;

  const tint = isSplit ? '#94a3b8' : (category?.color ?? '#94a3b8');

  // A split has no single category to show; a transfer keeps its directional arrow. Everything
  // else shows its own category's icon so the two primary organizing dimensions (category,
  // labels) are visible without opening the row.
  const iconNode = isSplit ? (
    <Split size={16} style={{ color: tint }} />
  ) : isTransfer ? (
    <ArrowLeftRight size={16} style={{ color: tint }} />
  ) : (
    <CategoryIcon icon={category?.icon ?? 'circle-ellipsis'} size={16} color={tint} />
  );

  const secondaryLine =
    isTransfer && toAccount
      ? `${account?.name ?? '?'} → ${toAccount.name}`
      : `${splitTitle ?? category?.name ?? 'Uncategorized'} · ${account?.name ?? 'Unknown account'}`;

  return (
    <>
      <button
        ref={rowRef}
        onClick={handleClick}
        aria-pressed={selectionMode ? selected : undefined}
        {...(longPressEnabled ? longPressHandlers : undefined)}
        className="card-elevated flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all hover:shadow-md active:scale-[0.98] lg:pr-3"
      >
        {selectionMode && (
          <Checkbox checked={selected} className="pointer-events-none shrink-0" tabIndex={-1} />
        )}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundImage: `linear-gradient(135deg, ${tint}26, ${tint}10)` }}
        >
          {iconNode}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {transaction.note || splitTitle || category?.name || 'Transaction'}
            {transaction.recurringId && (
              <Repeat size={12} className="text-muted-foreground" aria-label="Recurring" />
            )}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {secondaryLine}
            {showDate && <span className="opacity-60"> · {formatDate(transaction.date)}</span>}
          </p>
        </div>
        <p className={`text-sm font-semibold ${amountColor}`}>
          <span className="sr-only">{typeLabel}: </span>
          {amountPrefix}
          {formatCurrency(transaction.amount, false, hideAmounts)}
        </p>
      </button>

      {longPressEnabled && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuContent anchor={rowRef} align="start" side="bottom">
            <DropdownMenuItem onClick={() => handleMenuAction('select')}>
              <CheckSquare /> Select
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleMenuAction('duplicate')}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleMenuAction('template')}>
              <BookmarkPlus /> Save as template
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => handleMenuAction('delete')}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
});
