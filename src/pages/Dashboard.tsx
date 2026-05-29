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
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

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
    () =>
      computeBudgetStatuses(
        budgets.filter((b) => b.categoryId === ''),
        monthTxns,
      )[0] ?? null,
    [budgets, monthTxns],
  );

  return (
    <>
      {/* Header */}
      <Header>
        <div>
          <p className="text-muted-foreground text-sm">{getGreeting()},</p>
          <h1 className="text-xl font-bold">{userName} 👋</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="bg-card border-border hover:bg-muted flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
          aria-label="Settings"
        >
          <Settings2 size={18} className="text-muted-foreground" />
        </button>
      </Header>

      <Main>
        {/* Hero Balance Card */}
        <div className="bg-grad-primary shadow-glow-primary relative overflow-hidden rounded-3xl p-5 text-white">
          <div
            className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div
            className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-1 flex items-center gap-2 opacity-90">
              <Wallet size={14} />
              <span className="text-xs font-medium tracking-wide uppercase">Total Balance</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {formatCurrency(totalBalance, currency)}
            </p>
            {netWorth !== totalBalance && (
              <p className="mt-1 text-xs text-white/80">
                Net worth: {formatCurrency(netWorth, currency, true)}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                <div className="mb-0.5 flex items-center gap-1.5 opacity-90">
                  <TrendingUp size={12} />
                  <span className="text-[10px] tracking-wide uppercase">Income</span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(monthIncome, currency, true)}
                </p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                <div className="mb-0.5 flex items-center gap-1.5 opacity-90">
                  <TrendingDown size={12} />
                  <span className="text-[10px] tracking-wide uppercase">Expenses</span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(monthExpenses, currency, true)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        {monthTxns.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card-elevated bg-grad-primary-soft rounded-2xl p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <CalendarRange size={12} className="text-primary" />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Daily avg
                </span>
              </div>
              <p className="text-sm font-bold">
                {formatCurrency(stats.dailyAverage, currency, true)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">
                Projected: {formatCurrency(stats.projectedMonth, currency, true)}
              </p>
            </div>
            <div className="card-elevated bg-grad-success-soft rounded-2xl p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <PiggyBank size={12} className="text-emerald-500" />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Savings rate
                </span>
              </div>
              <p className="text-sm font-bold">{Math.round(stats.savingsRate * 100)}%</p>
              {prevMonthTxns.length > 0 && (
                <p
                  className={`mt-0.5 text-[10px] ${stats.monthOverMonthChange > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
                >
                  Spend {formatPercentChange(stats.monthOverMonthChange)} vs last mo
                </p>
              )}
            </div>
            {stats.topCategory && (
              <div className="card-elevated col-span-2 flex items-center gap-3 rounded-2xl p-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${stats.topCategory.category.color}, ${stats.topCategory.category.color}cc)`,
                  }}
                >
                  {stats.topCategory.category.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Top category this month
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {stats.topCategory.category.name}
                  </p>
                </div>
                <p className="text-sm font-bold">
                  {formatCurrency(stats.topCategory.amount, currency, true)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Overall budget progress (if set) */}
        {overallBudget && (
          <button
            onClick={() => navigate('/budgets')}
            className="card-elevated w-full rounded-2xl p-4 text-left"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-primary" />
                <span className="text-sm font-semibold">Monthly Budget</span>
              </div>
              <span
                className={`text-xs font-medium ${overallBudget.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}
              >
                {formatCurrency(overallBudget.spent, currency, true)} /{' '}
                {formatCurrency(overallBudget.budget.amount, currency, true)}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
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
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">My Accounts</h2>
            <button
              onClick={() => navigate('/accounts')}
              className="text-primary text-xs font-medium hover:underline"
            >
              See all
            </button>
          </div>
          {accounts.length === 0 ? (
            <button
              onClick={() => navigate('/add-account')}
              className="border-primary/40 bg-grad-primary-soft hover:bg-primary/10 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors"
            >
              <Plus size={24} className="text-primary" />
              <span className="text-primary text-sm font-medium">Add your first account</span>
              <span className="text-muted-foreground text-center text-xs">
                You need at least one account to record transactions.
              </span>
            </button>
          ) : (
            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                />
              ))}
            </div>
          )}
        </>

        {/* Recent Transactions */}
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              <Sparkles size={14} className="text-primary" /> Recent Transactions
            </h2>
            <button
              onClick={() => navigate('/transactions')}
              className="text-primary text-xs font-medium hover:underline"
            >
              See all
            </button>
          </div>
          {recentTxns.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
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
        </>
      </Main>
    </>
  );
}
