import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Plus, CreditCard, Wallet } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { getTotalAccountBalance, getTotalCreditOutstanding } from '@/utils/calculations';
import { AccountCard } from '@/components/accounts/AccountCard';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

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
            <p className="text-lg font-bold">{formatCurrency(totalBalance, currency, true)}</p>
          </div>
          {creditAccounts.length > 0 && (
            <div className="card-elevated bg-grad-danger-soft rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <CreditCard size={12} className="text-rose-500" />
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Credit Due
                </p>
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
            <h2 className="text-muted-foreground mb-3 text-sm font-medium">Accounts</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {regularAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  variant="grid"
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                  onDelete={() => {
                    if (
                      confirm(
                        `Delete "${account.name}"? All associated transactions will also be deleted.`,
                      )
                    ) {
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
            <h2 className="text-muted-foreground mb-3 text-sm font-medium">Credit Cards</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {creditAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  variant="grid"
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                  onDelete={() => {
                    if (
                      confirm(
                        `Delete "${account.name}"? All associated transactions will also be deleted.`,
                      )
                    ) {
                      deleteAccount(account.id);
                    }
                  }}
                />
              ))}
            </div>
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
