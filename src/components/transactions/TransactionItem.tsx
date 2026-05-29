import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Repeat } from 'lucide-react';
import { formatCurrency, formatTime } from '@/utils/formatters';
import type { Transaction, Category, Account, Currency } from '@/types';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  accounts: Account[];
  currency: Currency;
  onClick?: () => void;
}

export function TransactionItem({ transaction, categories, accounts, currency, onClick }: TransactionItemProps) {
  const category = categories.find((c) => c.id === transaction.categoryId);
  const account = accounts.find((a) => a.id === transaction.accountId);
  const toAccount = transaction.toAccountId
    ? accounts.find((a) => a.id === transaction.toAccountId)
    : undefined;

  const TypeIcon =
    transaction.type === 'income'
      ? ArrowDownLeft
      : transaction.type === 'expense'
      ? ArrowUpRight
      : ArrowLeftRight;

  const amountColor =
    transaction.type === 'income'
      ? 'text-emerald-500'
      : transaction.type === 'expense'
      ? 'text-rose-500'
      : 'text-sky-500';

  const amountPrefix =
    transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';

  const tint = category?.color ?? '#94a3b8';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 card-elevated rounded-2xl text-left active:scale-[0.98] transition-all hover:shadow-md"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundImage: `linear-gradient(135deg, ${tint}26, ${tint}10)` }}
      >
        <TypeIcon size={16} style={{ color: tint }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {transaction.note || category?.name || 'Transaction'}
          {transaction.recurringId && (
            <Repeat size={12} className="text-muted-foreground" aria-label="Recurring" />
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {transaction.type === 'transfer' && toAccount
            ? `${account?.name ?? '?'} → ${toAccount.name}`
            : (account?.name ?? 'Unknown account')}
          <span className="opacity-60"> · {formatTime(transaction.date)}</span>
        </p>
      </div>
      <p className={`text-sm font-semibold ${amountColor}`}>
        {amountPrefix}
        {formatCurrency(transaction.amount, currency)}
      </p>
    </button>
  );
}

