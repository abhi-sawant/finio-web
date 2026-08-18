import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, shouldCompactGroup } from '@/utils/formatters';
import {
  activeAccounts,
  getTotalAccountBalance,
  getTotalCreditOutstanding,
} from '@/utils/calculations';
import type { Account } from '@/types';
import { AccountCard } from '@/components/accounts/AccountCard';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
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
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);

  const [showArchived, setShowArchived] = useState(false);

  const totalBalance = useMemo(() => getTotalAccountBalance(accounts), [accounts]);
  const creditDue = useMemo(() => getTotalCreditOutstanding(accounts), [accounts]);

  const open = useMemo(() => activeAccounts(accounts), [accounts]);
  const regularAccounts = useMemo(() => open.filter((a) => a.type !== 'credit'), [open]);
  const creditAccounts = useMemo(() => open.filter((a) => a.type === 'credit'), [open]);
  const archivedAccounts = useMemo(() => accounts.filter((a) => a.archivedAt), [accounts]);
  // Open accounts are all visible on this page together, so their balances compact as one
  // group; archived accounts are a separate, collapsed context.
  const openCompact = useMemo(() => shouldCompactGroup(open.map((a) => a.balance)), [open]);
  const archivedCompact = useMemo(
    () => shouldCompactGroup(archivedAccounts.map((a) => a.balance)),
    [archivedAccounts],
  );
  const txCountByAccount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (t.accountId) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
      if (t.toAccountId) counts.set(t.toAccountId, (counts.get(t.toAccountId) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

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
        <div className="flex gap-2">
          <HideAmountsToggle />
          <button
            onClick={() => navigate('/add-account')}
            className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Add account"
          >
            <Plus size={16} />
          </button>
        </div>
      </Header>
      <Main>
        {/* Summary */}
        <div className="card-elevated rounded-md p-4 text-center">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Net balance
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {formatCurrency(totalBalance, true, hideAmounts)}
          </p>
          {creditAccounts.length > 0 && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              {formatCurrency(creditDue, true, hideAmounts)} owed on {creditAccounts.length} card
              {creditAccounts.length === 1 ? '' : 's'} ·{' '}
              {formatCurrency(totalBalance - creditDue, true, hideAmounts)} after dues
            </p>
          )}
        </div>

        {/* Regular Accounts */}
        {regularAccounts.length > 0 && (
          <div>
            <h2 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              Accounts
            </h2>
            <div className="card-elevated divide-border divide-y rounded-md px-4">
              {regularAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  forceCompact={openCompact}
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
            <h2 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              Credit cards
            </h2>
            <div className="card-elevated divide-border divide-y rounded-md px-4">
              {creditAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  forceCompact={openCompact}
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
              className="text-muted-foreground mb-2 flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase"
              aria-expanded={showArchived}
            >
              {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Archived ({archivedAccounts.length})
            </button>
            {showArchived && (
              <div className="card-elevated divide-border divide-y rounded-md px-4">
                {archivedAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    forceCompact={archivedCompact}
                    transactionCount={txCountByAccount.get(account.id) ?? 0}
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
              className="bg-primary text-primary-foreground rounded-full px-5 py-2.5 text-sm font-medium"
            >
              Add Account
            </button>
          </div>
        )}
      </Main>
    </>
  );
}
