import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, CreditCard, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import {
  activeAccounts,
  getTotalAccountBalance,
  getTotalCreditOutstanding,
} from '@/utils/calculations';
import type { Account } from '@/types';
import { AccountCard } from '@/components/accounts/AccountCard';
import { useConfirm } from '@/components/ui/use-confirm';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

export default function Accounts() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const setAccountArchived = useFinanceStore((s) => s.setAccountArchived);

  const [showArchived, setShowArchived] = useState(false);

  const totalBalance = useMemo(() => getTotalAccountBalance(accounts), [accounts]);
  const creditDue = useMemo(() => getTotalCreditOutstanding(accounts), [accounts]);

  const open = useMemo(() => activeAccounts(accounts), [accounts]);
  const regularAccounts = useMemo(() => open.filter((a) => a.type !== 'credit'), [open]);
  const creditAccounts = useMemo(() => open.filter((a) => a.type === 'credit'), [open]);
  const archivedAccounts = useMemo(() => accounts.filter((a) => a.archivedAt), [accounts]);

  const handleDelete = async (account: Account) => {
    const txCount = transactions.filter(
      (t) => t.accountId === account.id || t.toAccountId === account.id,
    ).length;

    const confirmed = await confirm({
      title: `Delete "${account.name}"?`,
      description:
        txCount > 0
          ? `${txCount} transaction${txCount === 1 ? '' : 's'} on this account will be deleted too, and this cannot be undone. Archive it instead to close the account but keep its history.`
          : 'This cannot be undone.',
      confirmLabel: 'Delete permanently',
    });
    if (confirmed) deleteAccount(account.id);
  };

  const handleToggleArchive = async (account: Account) => {
    if (account.archivedAt) {
      setAccountArchived(account.id, false);
      toast.success(`"${account.name}" reopened`);
      return;
    }

    const confirmed = await confirm({
      title: `Archive "${account.name}"?`,
      description:
        'Its transactions stay in your history, but the account drops out of pickers and running totals. You can reopen it any time.',
      confirmLabel: 'Archive',
      destructive: false,
    });
    if (confirmed) {
      setAccountArchived(account.id, true);
      toast.success(`"${account.name}" archived`);
    }
  };

  return (
    <>
      {/* Header */}
      <Header>
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <button
          onClick={() => navigate('/add-account')}
          className="bg-grad-primary shadow-glow-primary flex h-9 w-9 items-center justify-center rounded-full text-white"
          aria-label="Add account"
        >
          <Plus size={18} />
        </button>
      </Header>
      <Main>
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <div className="card-elevated bg-grad-primary-soft rounded-2xl p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <Wallet size={12} className="text-primary" />
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Net Balance
              </p>
            </div>
            <p className="text-lg font-bold">{formatCurrency(totalBalance, true)}</p>
          </div>
          {creditAccounts.length > 0 && (
            <div className="card-elevated bg-grad-danger-soft rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <CreditCard size={12} className="text-rose-500" />
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Credit Due
                </p>
              </div>
              <p className="text-lg font-bold text-rose-500">{formatCurrency(creditDue, true)}</p>
            </div>
          )}
        </div>

        {/* Regular Accounts */}
        {regularAccounts.length > 0 && (
          <div>
            <h2 className="text-muted-foreground mb-3 text-sm font-medium">Accounts</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {regularAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  variant="grid"
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                  onDelete={() => handleDelete(account)}
                  onToggleArchive={() => handleToggleArchive(account)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Credit Accounts */}
        {creditAccounts.length > 0 && (
          <div>
            <h2 className="text-muted-foreground mb-3 text-sm font-medium">Credit Cards</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {creditAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  variant="grid"
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                  onDelete={() => handleDelete(account)}
                  onToggleArchive={() => handleToggleArchive(account)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Archived accounts — collapsed, since they are closed but still hold history */}
        {archivedAccounts.length > 0 && (
          <div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-muted-foreground mb-3 flex items-center gap-1 text-sm font-medium"
              aria-expanded={showArchived}
            >
              {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Archived ({archivedAccounts.length})
            </button>
            {showArchived && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {archivedAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    variant="grid"
                    onClick={() => navigate(`/edit-account/${account.id}`)}
                    onDelete={() => handleDelete(account)}
                    onToggleArchive={() => handleToggleArchive(account)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {accounts.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No accounts yet</p>
            <button
              onClick={() => navigate('/add-account')}
              className="bg-grad-primary shadow-glow-primary rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Add Account
            </button>
          </div>
        )}
      </Main>
    </>
  );
}
