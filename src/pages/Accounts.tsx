import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Plus, CreditCard, Wallet } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { getTotalAccountBalance, getTotalCreditOutstanding } from '@/utils/calculations';
import { AccountCard } from '@/components/accounts/AccountCard';

export default function Accounts() {
  const navigate = useNavigate();
  const accounts = useFinanceStore((s) => s.accounts);
  const currency = useFinanceStore((s) => s.settings.currency);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);

  const totalBalance = useMemo(() => getTotalAccountBalance(accounts), [accounts]);
  const creditDue = useMemo(() => getTotalCreditOutstanding(accounts), [accounts]);

  const regularAccounts = useMemo(() => accounts.filter((a) => a.type !== 'credit'), [accounts]);
  const creditAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit'), [accounts]);

  return (
    <div className="px-4 pb-6 safe-top">
      {/* Header */}
      <header className="flex py-3 items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <button
          onClick={() => navigate('/add-account')}
          className="w-9 h-9 rounded-full bg-grad-primary text-white flex items-center justify-center shadow-glow-primary"
          aria-label="Add account"
        >
          <Plus size={18} />
        </button>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 card-elevated bg-grad-primary-soft">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-primary" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Net Balance</p>
          </div>
          <p className="text-lg font-bold">{formatCurrency(totalBalance, currency, true)}</p>
        </div>
        {creditAccounts.length > 0 && (
          <div className="rounded-2xl p-4 card-elevated bg-grad-danger-soft">
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard size={12} className="text-rose-500" />
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Credit Due</p>
            </div>
            <p className="text-lg font-bold text-rose-500">
              {formatCurrency(creditDue, currency, true)}
            </p>
          </div>
        )}
      </div>

      {/* Regular Accounts */}
      {regularAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Accounts</h2>
          <div className="grid grid-cols-2 gap-3">
            {regularAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                variant="grid"
                onClick={() => navigate(`/edit-account/${account.id}`)}
                onDelete={() => {
                  if (confirm(`Delete "${account.name}"? All associated transactions will also be deleted.`)) {
                    deleteAccount(account.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Credit Accounts */}
      {creditAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Credit Cards</h2>
          <div className="grid grid-cols-2 gap-3">
            {creditAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                variant="grid"
                onClick={() => navigate(`/edit-account/${account.id}`)}
                onDelete={() => {
                  if (confirm(`Delete "${account.name}"? All associated transactions will also be deleted.`)) {
                    deleteAccount(account.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No accounts yet</p>
          <button
            onClick={() => navigate('/add-account')}
            className="bg-grad-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-glow-primary"
          >
            Add Account
          </button>
        </div>
      )}
    </div>
  );
}

