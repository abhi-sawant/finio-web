import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { getHours, differenceInCalendarDays } from 'date-fns';
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
  AlertTriangle,
  Repeat,
  CreditCard,
  HandCoins,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatPercentChange, shouldCompactGroup } from '@/utils/formatters';
import {
  activeAccounts,
  getTotalIncome,
  getTotalExpenses,
  getTotalAccountBalance,
  getTotalCreditOutstanding,
  getCreditCardDueInfo,
  getCurrentMonthTransactions,
  getPreviousMonthTransactions,
  getDashboardStats,
  sortTransactionsDateDesc,
  computeBudgetStatuses,
  computeGoalStatus,
  computePersonBalance,
  BUDGET_NEAR_LIMIT_PERCENT,
} from '@/utils/calculations';
import { BudgetHealthBadge, BudgetProgressBar } from '@/components/budgets/BudgetHealthBadge';
import { GoalIcon } from '@/components/goals/GoalIcon';
import { PersonIcon } from '@/components/people/PersonIcon';
import { PERIOD_LABELS, normalizeMonthStartDay } from '@/utils/period';
import { isRulePaused, nextDueDate } from '@/store/recurring';

import { TransactionItem } from '@/components/transactions/TransactionItem';
import { AccountCard } from '@/components/accounts/AccountCard';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
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
  const labels = useFinanceStore((s) => s.labels);
  const recurring = useFinanceStore((s) => s.recurring);
  const goals = useFinanceStore((s) => s.goals);
  const goalContributions = useFinanceStore((s) => s.goalContributions);
  const people = useFinanceStore((s) => s.people);
  const debtEntries = useFinanceStore((s) => s.debtEntries);
  const userName = useFinanceStore((s) => s.settings.userName);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);

  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  const monthTxns = useMemo(
    () => getCurrentMonthTransactions(transactions, monthStartDay),
    [transactions, monthStartDay],
  );
  const prevMonthTxns = useMemo(
    () => getPreviousMonthTransactions(transactions, monthStartDay),
    [transactions, monthStartDay],
  );
  const openAccounts = useMemo(() => activeAccounts(accounts), [accounts]);
  const totalBalance = useMemo(() => getTotalAccountBalance(accounts), [accounts]);
  const creditOutstanding = useMemo(() => getTotalCreditOutstanding(accounts), [accounts]);
  const afterDues = totalBalance - creditOutstanding;
  const monthIncome = useMemo(() => getTotalIncome(monthTxns), [monthTxns]);
  const monthExpenses = useMemo(() => getTotalExpenses(monthTxns), [monthTxns]);
  // Income and Expenses sit side by side and are meant to be compared at a glance, so they
  // compact together rather than one flipping to "₹2.3L" while the other stays "₹90,010".
  const heroCompact = useMemo(
    () => shouldCompactGroup([monthIncome, monthExpenses]),
    [monthIncome, monthExpenses],
  );
  const accountsCompact = useMemo(
    () => shouldCompactGroup(openAccounts.map((a) => a.balance)),
    [openAccounts],
  );
  const recentTxns = useMemo(
    () => sortTransactionsDateDesc(transactions).slice(0, 5),
    [transactions],
  );
  const stats = useMemo(
    () => getDashboardStats(monthTxns, prevMonthTxns, categories, { monthStartDay }),
    [monthTxns, prevMonthTxns, categories, monthStartDay],
  );
  const allBudgetStatuses = useMemo(
    () => computeBudgetStatuses(budgets, transactions, { monthStartDay }),
    [budgets, transactions, monthStartDay],
  );
  const overallBudget = useMemo(
    () => allBudgetStatuses.find((s) => !s.budget.labelId && s.budget.categoryId === '') ?? null,
    [allBudgetStatuses],
  );
  // The overall budget always gets its own "Monthly Budget" card below, so it's excluded here
  // — otherwise a near-limit overall budget would state the same fact in both cards.
  const nearLimitBudgets = useMemo(
    () =>
      allBudgetStatuses.filter(
        (s) => s.percent >= BUDGET_NEAR_LIMIT_PERCENT && s.budget.id !== overallBudget?.budget.id,
      ),
    [allBudgetStatuses, overallBudget],
  );
  const upcomingRecurring = useMemo(() => {
    const now = new Date();
    // Paused and finished rules have no next bill to warn about.
    return recurring
      .filter((rule) => !isRulePaused(rule))
      .flatMap((rule) => {
        const nextDue = nextDueDate(rule);
        if (!nextDue) return [];
        return [{ rule, nextDue, daysUntil: differenceInCalendarDays(nextDue, now) }];
      })
      .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= 7)
      .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
  }, [recurring]);
  const upcomingRecurringCompact = useMemo(
    () => shouldCompactGroup(upcomingRecurring.map(({ rule }) => rule.amount)),
    [upcomingRecurring],
  );
  // In-progress goals, closest to done first — completed ones have nothing left to track.
  const topGoals = useMemo(
    () =>
      goals
        .map((g) => computeGoalStatus(g, goalContributions))
        .filter((s) => !s.isComplete)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 2),
    [goals, goalContributions],
  );
  // Anyone with an open balance, biggest first — settled-up people have nothing to show.
  const topDebts = useMemo(
    () =>
      people
        .map((p) => computePersonBalance(p, debtEntries))
        .filter((s) => s.balance !== 0)
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
        .slice(0, 3),
    [people, debtEntries],
  );
  const creditDues = useMemo(() => {
    return openAccounts
      .filter((a) => a.type === 'credit')
      .flatMap((account) => {
        const dueInfo = getCreditCardDueInfo(account);
        return dueInfo && dueInfo.daysUntilDue <= 7 ? [{ account, dueInfo }] : [];
      })
      .sort((a, b) => a.dueInfo.daysUntilDue - b.dueInfo.daysUntilDue);
  }, [openAccounts]);

  return (
    <>
      {/* Header */}
      <Header>
        <div>
          <p className="text-muted-foreground text-sm">{getGreeting()},</p>
          <h1 className="text-xl font-bold">{userName} 👋</h1>
        </div>
        <div className="flex gap-2">
          <HideAmountsToggle />
          <button
            onClick={() => navigate('/settings')}
            className="bg-card border-border hover:bg-muted flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
            aria-label="Settings"
          >
            <Settings2 size={16} />
          </button>
        </div>
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
              {formatCurrency(totalBalance, false, hideAmounts)}
            </p>
            {creditOutstanding > 0 && (
              <p className="mt-1 text-xs text-white/80">
                After Dues: {formatCurrency(afterDues, false, hideAmounts)}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                <div className="mb-0.5 flex items-center gap-1.5 opacity-90">
                  <TrendingUp size={12} />
                  <span className="text-[10px] tracking-wide uppercase">Income</span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(monthIncome, true, hideAmounts, { forceCompact: heroCompact })}
                </p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                <div className="mb-0.5 flex items-center gap-1.5 opacity-90">
                  <TrendingDown size={12} />
                  <span className="text-[10px] tracking-wide uppercase">Expenses</span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(monthExpenses, true, hideAmounts, { forceCompact: heroCompact })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        {monthTxns.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card-elevated bg-grad-primary-soft rounded-2xl p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <CalendarRange size={12} className="text-primary" />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Daily avg
                </span>
              </div>
              <p className="text-sm font-bold">
                {formatCurrency(stats.dailyAverage, true, hideAmounts, { precise: false })}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">
                Projected:{' '}
                {formatCurrency(stats.projectedMonth, true, hideAmounts, { precise: false })}
              </p>
            </div>
            <div className="card-elevated bg-grad-success-soft rounded-2xl p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <PiggyBank size={12} className="text-emerald-500" />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Savings rate
                </span>
              </div>
              <p className={`text-sm font-bold ${stats.savingsRate < 0 ? 'text-rose-500' : ''}`}>
                {Math.round(stats.savingsRate * 100)}%
              </p>
              {stats.savingsRateChange !== null && (
                <p
                  className={`mt-0.5 text-[10px] ${stats.savingsRateChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {formatPercentChange(stats.savingsRateChange)} vs last mo
                </p>
              )}
            </div>
            {stats.topCategory && (
              <div className="card-elevated col-span-2 flex items-center gap-3 rounded-2xl p-3 pr-16 lg:col-span-2 lg:pr-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${stats.topCategory.category.color}, ${stats.topCategory.category.color}cc)`,
                  }}
                >
                  <CategoryIcon icon={stats.topCategory.category.icon} size={18} color="white" />
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
                  {formatCurrency(stats.topCategory.amount, true, hideAmounts)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Budget/goal/debt/bill cards — each is independent and self-contained, so they pair up
            two-per-row starting at tablet width instead of running the full content width (a
            progress bar or a 2-row list doesn't need ~750px to read). */}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {/* Budget Alerts — shown when any budget hits 85%+ */}
        {nearLimitBudgets.length > 0 && (
          <button
            onClick={() => navigate('/budgets')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15">
                <AlertTriangle size={13} className="text-amber-500" />
              </div>
              <span className="text-sm font-semibold">Budget Alert</span>
              <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                {nearLimitBudgets.length} near limit
              </span>
            </div>
            <div className="space-y-2.5">
              {nearLimitBudgets.map((s) => {
                const label = s.budget.labelId
                  ? (labels.find((l) => l.id === s.budget.labelId)?.name ?? 'Unknown label')
                  : s.budget.categoryId === ''
                    ? 'Overall Expenses'
                    : (categories.find((c) => c.id === s.budget.categoryId)?.name ?? 'Unknown');
                return (
                  <div key={s.budget.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <BudgetHealthBadge status={s} />
                        <span
                          className={`text-xs font-semibold ${s.isOver ? 'text-rose-500' : 'text-amber-500'}`}
                        >
                          {Math.round(s.percent)}%
                        </span>
                      </span>
                    </div>
                    <BudgetProgressBar
                      status={s}
                      okFill="var(--grad-warning)"
                      className="h-1.5"
                      valueText={`${label}: ${formatCurrency(s.spent, true, hideAmounts)} of ${formatCurrency(
                        s.limit,
                        true,
                        hideAmounts,
                      )} spent`}
                    />
                  </div>
                );
              })}
            </div>
          </button>
        )}

        {/* Overall budget progress (if set) */}
        {overallBudget && (
          <button
            onClick={() => navigate('/budgets')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-primary" />
                <span className="text-sm font-semibold">
                  {PERIOD_LABELS[overallBudget.budget.period]} Budget
                </span>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <BudgetHealthBadge status={overallBudget} />
                <span
                  className={`text-xs font-medium ${overallBudget.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}
                >
                  {formatCurrency(overallBudget.spent, true, hideAmounts)} /{' '}
                  {formatCurrency(overallBudget.limit, true, hideAmounts)}
                </span>
              </span>
            </div>
            <BudgetProgressBar
              status={overallBudget}
              okFill="var(--grad-primary)"
              valueText={`${formatCurrency(overallBudget.spent, true, hideAmounts)} of ${formatCurrency(
                overallBudget.limit,
                true,
                hideAmounts,
              )} spent`}
            />
          </button>
        )}

        {/* Savings goals — shown for the goals furthest along that aren't done yet */}
        {topGoals.length > 0 && (
          <button
            onClick={() => navigate('/goals')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="bg-grad-success-soft flex h-6 w-6 items-center justify-center rounded-full">
                <PiggyBank size={13} className="text-emerald-500" />
              </div>
              <span className="text-sm font-semibold">Savings Goals</span>
            </div>
            <div className="space-y-3">
              {topGoals.map((s) => (
                <div key={s.goal.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <GoalIcon icon={s.goal.icon} size={12} color={s.goal.color} />
                      {s.goal.name}
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">
                      {formatCurrency(s.current, true, hideAmounts)} /{' '}
                      {formatCurrency(s.goal.targetAmount, true, hideAmounts)}
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(s.percent, 0), 100)}%`,
                        backgroundImage: `linear-gradient(90deg, ${s.goal.color}, ${s.goal.color}cc)`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* Debts & lending — shown for the biggest open balances */}
        {topDebts.length > 0 && (
          <button
            onClick={() => navigate('/debts')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="bg-grad-primary-soft flex h-6 w-6 items-center justify-center rounded-full">
                <HandCoins size={13} className="text-primary" />
              </div>
              <span className="text-sm font-semibold">Debts & Lending</span>
            </div>
            <div className="space-y-2.5">
              {topDebts.map((s) => (
                <div key={s.person.id} className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${s.person.color}, ${s.person.color}cc)`,
                    }}
                  >
                    <PersonIcon icon={s.person.icon} size={14} color="white" />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{s.person.name}</p>
                  <p
                    className={`shrink-0 text-xs font-semibold ${s.balance > 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {s.balance > 0 ? 'Owes you ' : 'You owe '}
                    {formatCurrency(Math.abs(s.balance), true, hideAmounts)}
                  </p>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* Credit card payments — shown when a configured due date falls within 7 days, or is overdue */}
        {creditDues.length > 0 && (
          <button
            onClick={() => navigate('/accounts')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/15">
                <CreditCard size={13} className="text-rose-500" />
              </div>
              <span className="text-sm font-semibold">Card Payments Due</span>
              <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                this week
              </span>
            </div>
            <div className="space-y-2.5">
              {creditDues.map(({ account, dueInfo }) => {
                const label = dueInfo.isOverdue
                  ? `Overdue by ${Math.abs(dueInfo.daysUntilDue)} day${Math.abs(dueInfo.daysUntilDue) === 1 ? '' : 's'}`
                  : dueInfo.daysUntilDue === 0
                    ? 'Due today'
                    : dueInfo.daysUntilDue === 1
                      ? 'Due tomorrow'
                      : `Due in ${dueInfo.daysUntilDue} days`;
                return (
                  <div key={account.id} className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${account.color}, ${account.color}cc)`,
                      }}
                    >
                      <CreditCard size={14} color="white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{account.name}</p>
                      <p
                        className={`text-[10px] ${dueInfo.isOverdue ? 'text-rose-500' : 'text-muted-foreground'}`}
                      >
                        {label}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-rose-500">
                        {formatCurrency(dueInfo.outstanding, true, hideAmounts, {
                          precise: false,
                        })}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        Min{' '}
                        {formatCurrency(dueInfo.minimumDue, true, hideAmounts, {
                          precise: false,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </button>
        )}

        {/* Upcoming Recurring — shown when a rule fires within 7 days */}
        {upcomingRecurring.length > 0 && (
          <button
            onClick={() => navigate('/recurring')}
            className="card-elevated w-full rounded-2xl p-4 text-left lg:pr-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/15">
                <Repeat size={13} className="text-blue-500" />
              </div>
              {/* Not just "Bills" — a recurring rule can be income too. */}
              <span className="text-sm font-semibold">Upcoming</span>
              <span className="ml-auto rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-500">
                this week
              </span>
            </div>
            <div className="space-y-2.5">
              {upcomingRecurring.map(({ rule, daysUntil }) => {
                const cat = categories.find((c) => c.id === rule.categoryId);
                const label = rule.note || cat?.name || 'Recurring';
                const color = cat?.color ?? '#94a3b8';
                const dueLabel =
                  daysUntil === 0
                    ? 'Due today'
                    : daysUntil === 1
                      ? 'Due tomorrow'
                      : `Due in ${daysUntil} days`;
                return (
                  <div key={rule.id} className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                    >
                      <Repeat size={14} color="white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{label}</p>
                      <p className="text-muted-foreground text-[10px]">{dueLabel}</p>
                    </div>
                    <p
                      className={`shrink-0 text-xs font-semibold ${rule.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}
                    >
                      {rule.type === 'income' ? '+' : '-'}
                      {formatCurrency(rule.amount, true, hideAmounts, {
                        forceCompact: upcomingRecurringCompact,
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </button>
        )}
        </div>

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
            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-x-visible xl:grid-cols-4">
              {openAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  forceCompact={accountsCompact}
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
                  labels={labels}
                  showDate
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
