import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { getHours } from 'date-fns';
import {
  Settings2,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Sparkles,
  CalendarRange,
  PiggyBank,
  Target,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatPercentChange } from '@/utils/formatters';
import {
  getTotalIncome,
  getTotalExpenses,
  getTotalAccountBalance,
  getNetWorth,
  getCurrentMonthTransactions,
  getPreviousMonthTransactions,
  getDashboardStats,
  sortTransactionsDateDesc,
  computeBudgetStatuses,
} from '@/utils/calculations';
import { TransactionItem } from '@/components/transactions/TransactionItem';
import { AccountCard } from '@/components/accounts/AccountCard';

function getGreeting(): string {
  const hour = getHours(new Date());
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const budgets = useFinanceStore((s) => s.budgets);
  const userName = useFinanceStore((s) => s.settings.userName);
  const currency = useFinanceStore((s) => s.settings.currency);

  const monthTxns = useMemo(() => getCurrentMonthTransactions(transactions), [transactions]);
  const prevMonthTxns = useMemo(() => getPreviousMonthTransactions(transactions), [transactions]);
  const totalBalance = useMemo(() => getTotalAccountBalance(accounts), [accounts]);
  const netWorth = useMemo(() => getNetWorth(accounts), [accounts]);
  const monthIncome = useMemo(() => getTotalIncome(monthTxns), [monthTxns]);
  const monthExpenses = useMemo(() => getTotalExpenses(monthTxns), [monthTxns]);
  const recentTxns = useMemo(
    () => sortTransactionsDateDesc(transactions).slice(0, 5),
    [transactions],
  );
  const stats = useMemo(
    () => getDashboardStats(monthTxns, prevMonthTxns, categories),
    [monthTxns, prevMonthTxns, categories],
  );
  const overallBudget = useMemo(
    () => computeBudgetStatuses(budgets.filter((b) => b.categoryId === ''), monthTxns)[0] ?? null,
    [budgets, monthTxns],
  );

  return (
    <div className="px-4 pb-6 safe-top">
      {/* Header */}
      <header className="flex py-3 items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{getGreeting()},</p>
          <h1 className="text-xl font-bold">{userName} 👋</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Settings"
        >
          <Settings2 size={18} className="text-muted-foreground" />
        </button>
      </header>

      {/* Hero Balance Card */}
      <div className="relative overflow-hidden rounded-3xl p-5 text-white bg-grad-primary shadow-glow-primary">
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-16 -left-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1 opacity-90">
            <Wallet size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Balance</span>
          </div>
          <p className="text-3xl font-bold tracking-tight">{formatCurrency(totalBalance, currency)}</p>
          {netWorth !== totalBalance && (
            <p className="text-xs text-white/80 mt-1">
              Net worth: {formatCurrency(netWorth, currency, true)}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-white/15 backdrop-blur rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 mb-0.5 opacity-90">
                <TrendingUp size={12} />
                <span className="text-[10px] uppercase tracking-wide">Income</span>
              </div>
              <p className="text-sm font-semibold">{formatCurrency(monthIncome, currency, true)}</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 mb-0.5 opacity-90">
                <TrendingDown size={12} />
                <span className="text-[10px] uppercase tracking-wide">Expenses</span>
              </div>
              <p className="text-sm font-semibold">{formatCurrency(monthExpenses, currency, true)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      {monthTxns.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-3 card-elevated bg-grad-primary-soft">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarRange size={12} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Daily avg</span>
            </div>
            <p className="text-sm font-bold">{formatCurrency(stats.dailyAverage, currency, true)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Projected: {formatCurrency(stats.projectedMonth, currency, true)}
            </p>
          </div>
          <div className="rounded-2xl p-3 card-elevated bg-grad-success-soft">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank size={12} className="text-emerald-500" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Savings rate</span>
            </div>
            <p className="text-sm font-bold">{Math.round(stats.savingsRate * 100)}%</p>
            {prevMonthTxns.length > 0 && (
              <p className={`text-[10px] mt-0.5 ${stats.monthOverMonthChange > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                Spend {formatPercentChange(stats.monthOverMonthChange)} vs last mo
              </p>
            )}
          </div>
          {stats.topCategory && (
            <div className="rounded-2xl p-3 card-elevated col-span-2 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundImage: `linear-gradient(135deg, ${stats.topCategory.category.color}, ${stats.topCategory.category.color}cc)` }}
              >
                {stats.topCategory.category.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top category this month</p>
                <p className="text-sm font-semibold truncate">{stats.topCategory.category.name}</p>
              </div>
              <p className="text-sm font-bold">{formatCurrency(stats.topCategory.amount, currency, true)}</p>
            </div>
          )}
        </div>
      )}

      {/* Overall budget progress (if set) */}
      {overallBudget && (
        <button
          onClick={() => navigate('/budgets')}
          className="w-full text-left rounded-2xl p-4 card-elevated"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-primary" />
              <span className="text-sm font-semibold">Monthly Budget</span>
            </div>
            <span className={`text-xs font-medium ${overallBudget.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}>
              {formatCurrency(overallBudget.spent, currency, true)} / {formatCurrency(overallBudget.budget.amount, currency, true)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(overallBudget.percent, 100)}%`,
                backgroundImage: overallBudget.isOver
                  ? 'var(--grad-danger)'
                  : overallBudget.percent > 80
                  ? 'var(--grad-warning)'
                  : 'var(--grad-primary)',
              }}
            />
          </div>
        </button>
      )}

      {/* Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">My Accounts</h2>
          <button
            onClick={() => navigate('/accounts')}
            className="text-xs text-primary font-medium hover:underline"
          >
            See all
          </button>
        </div>
        {accounts.length === 0 ? (
          <button
            onClick={() => navigate('/add-account')}
            className="w-full border-2 border-dashed border-primary/40 rounded-2xl p-6 flex flex-col items-center gap-2 bg-grad-primary-soft hover:bg-primary/10 transition-colors"
          >
            <Plus size={24} className="text-primary" />
            <span className="text-sm font-medium text-primary">Add your first account</span>
            <span className="text-xs text-muted-foreground text-center">
              You need at least one account to record transactions.
            </span>
          </button>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onClick={() => navigate(`/edit-account/${account.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" /> Recent Transactions
          </h2>
          <button
            onClick={() => navigate('/transactions')}
            className="text-xs text-primary font-medium hover:underline"
          >
            See all
          </button>
        </div>
        {recentTxns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No transactions yet. Tap + to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                categories={categories}
                accounts={accounts}
                currency={currency}
                onClick={() => navigate(`/edit-transaction/${tx.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

