import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { differenceInCalendarDays } from 'date-fns';
import {
  Settings2,
  Plus,
  Sparkles,
  PiggyBank,
  AlertTriangle,
  HandCoins,
  ChevronRight,
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
  type BudgetStatus,
  type CreditCardDueInfo,
} from '@/utils/calculations';
import { BudgetProgressBar } from '@/components/budgets/BudgetHealthBadge';
import { GoalIcon } from '@/components/goals/GoalIcon';
import { PersonIcon } from '@/components/people/PersonIcon';
import { PERIOD_LABELS, normalizeMonthStartDay, periodRange } from '@/utils/period';
import { isRulePaused, nextDueDate } from '@/store/recurring';

import { TransactionItem } from '@/components/transactions/TransactionItem';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';
import type { Account, RecurringTransaction } from '@/types';

type AlertItem =
  | { kind: 'budget'; status: BudgetStatus; label: string }
  | { kind: 'credit'; account: Account; dueInfo: CreditCardDueInfo }
  | { kind: 'recurring'; rule: RecurringTransaction; label: string; daysUntil: number };

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

  const [alertsOpen, setAlertsOpen] = useState(false);

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
  const daysLeftInMonth = useMemo(() => {
    const range = periodRange('monthly', new Date(), monthStartDay);
    return Math.max(1, differenceInCalendarDays(range.end, new Date()) + 1);
  }, [monthStartDay]);
  // The overall budget always gets its own hero card below, so it's excluded from the
  // collapsed alert list — otherwise a near-limit overall budget would state the same fact twice.
  const nearLimitBudgets = useMemo(
    () =>
      allBudgetStatuses
        .filter(
          (s) => s.percent >= BUDGET_NEAR_LIMIT_PERCENT && s.budget.id !== overallBudget?.budget.id,
        )
        .sort((a, b) => Number(b.isOver) - Number(a.isOver) || b.percent - a.percent),
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

  const dueLabel = (daysUntil: number) =>
    daysUntil < 0
      ? `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'}`
      : daysUntil === 0
        ? 'due today'
        : daysUntil === 1
          ? 'due tomorrow'
          : `due in ${daysUntil} days`;

  const attentionItems: AlertItem[] = useMemo(() => {
    const budgetLabel = (s: BudgetStatus) =>
      s.budget.labelId
        ? (labels.find((l) => l.id === s.budget.labelId)?.name ?? 'Unknown label')
        : s.budget.categoryId === ''
          ? 'Overall expenses'
          : (categories.find((c) => c.id === s.budget.categoryId)?.name ?? 'Unknown');
    return [
      ...nearLimitBudgets.map((s) => ({
        kind: 'budget' as const,
        status: s,
        label: budgetLabel(s),
      })),
      ...creditDues.map(({ account, dueInfo }) => ({ kind: 'credit' as const, account, dueInfo })),
      ...upcomingRecurring.map(({ rule, daysUntil }) => {
        const cat = categories.find((c) => c.id === rule.categoryId);
        return {
          kind: 'recurring' as const,
          rule,
          label: rule.note || cat?.name || 'Recurring',
          daysUntil,
        };
      }),
    ];
  }, [nearLimitBudgets, creditDues, upcomingRecurring, labels, categories]);

  const describeAttention = (item: AlertItem): string => {
    if (item.kind === 'budget') {
      return item.status.isOver
        ? `${item.label} is ${formatCurrency(item.status.spent - item.status.limit, true, hideAmounts)} over budget`
        : `${item.label} is near its limit`;
    }
    if (item.kind === 'credit') {
      return `${item.account.name} ${dueLabel(item.dueInfo.daysUntilDue)}`;
    }
    return `${item.label} ${item.daysUntil === 0 ? 'posts today' : item.daysUntil === 1 ? 'posts tomorrow' : `posts in ${item.daysUntil} days`}`;
  };

  const attentionDetail = (item: AlertItem): string => {
    if (item.kind === 'budget') {
      return `${formatCurrency(item.status.spent, true, hideAmounts)} of ${formatCurrency(item.status.limit, true, hideAmounts)} · ${Math.round(item.status.percent)}%`;
    }
    if (item.kind === 'credit') {
      return `${formatCurrency(item.dueInfo.outstanding, true, hideAmounts)} · min ${formatCurrency(item.dueInfo.minimumDue, true, hideAmounts)}`;
    }
    return `Recurring · from ${accounts.find((a) => a.id === item.rule.accountId)?.name ?? 'account'}`;
  };

  const goToAttentionItem = (item: AlertItem) => {
    setAlertsOpen(false);
    if (item.kind === 'budget') navigate('/budgets');
    else if (item.kind === 'credit') navigate('/accounts');
    else navigate('/recurring');
  };

  const topAttention = attentionItems[0];

  return (
    <>
      {/* Header */}
      <Header>
        <div>
          <h1 className="text-xl font-bold">{userName}</h1>
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
        {/* Hero */}
        <div className="card-elevated rounded-md p-6 text-center">
          {overallBudget ? (
            <>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Safe to spend today
              </p>
              <p
                className={`mt-1 text-4xl font-bold tracking-tight ${overallBudget.isOver ? 'text-destructive' : 'text-primary'}`}
              >
                {formatCurrency(
                  Math.max(overallBudget.remaining, 0) / daysLeftInMonth,
                  false,
                  hideAmounts,
                )}
              </p>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {formatCurrency(overallBudget.remaining, false, hideAmounts)} left this{' '}
                {PERIOD_LABELS[overallBudget.budget.period].toLowerCase()} · {daysLeftInMonth} day
                {daysLeftInMonth === 1 ? '' : 's'} to go
              </p>
              <div className="mt-4">
                <BudgetProgressBar
                  status={overallBudget}
                  okFill="var(--primary)"
                  valueText={`${formatCurrency(overallBudget.spent, true, hideAmounts)} of ${formatCurrency(overallBudget.limit, true, hideAmounts)} spent`}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-[11px]">
                {formatCurrency(overallBudget.spent, true, hideAmounts)} of{' '}
                {formatCurrency(overallBudget.limit, true, hideAmounts)} spent
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Total balance
              </p>
              <p className="text-primary mt-1 text-4xl font-bold tracking-tight">
                {formatCurrency(totalBalance, false, hideAmounts)}
              </p>
              {creditOutstanding > 0 && (
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {formatCurrency(afterDues, false, hideAmounts)} after card dues
                </p>
              )}
              {accounts.length > 0 && (
                <button
                  onClick={() => navigate('/budgets')}
                  className="bg-primary text-primary-foreground mt-4 rounded-full px-5 py-2 text-sm font-medium"
                >
                  Set a monthly budget
                </button>
              )}
            </>
          )}
        </div>

        {/* Total balance + IN/OUT/DAILY AVG/SAVED/TOP — one plain card, no tinted tiles */}
        <div className="card-elevated rounded-md p-4">
          {overallBudget && (
            <div className="border-border mb-3 flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground text-xs">Total balance</span>
              <div className="text-right">
                <p className="text-base font-bold">
                  {formatCurrency(totalBalance, false, hideAmounts)}
                </p>
                {creditOutstanding > 0 && (
                  <p className="text-muted-foreground text-[11px]">
                    {formatCurrency(afterDues, false, hideAmounts)} after card dues
                  </p>
                )}
              </div>
            </div>
          )}
          {monthTxns.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
              <div>
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">In</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {formatCurrency(monthIncome, true, hideAmounts)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Out</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {formatCurrency(monthExpenses, true, hideAmounts)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                  Daily avg
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {formatCurrency(stats.dailyAverage, true, hideAmounts, { precise: false })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Saved</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {Math.round(stats.savingsRate * 100)}%
                  {stats.savingsRateChange !== null && (
                    <span className="text-muted-foreground ml-1 text-[10px] font-normal">
                      {formatPercentChange(stats.savingsRateChange)}
                    </span>
                  )}
                </p>
              </div>
              {stats.topCategory && (
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Top</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">
                    {stats.topCategory.category.name}
                  </p>
                </div>
              )}
            </div>
          ) : (
            !overallBudget && (
              <p className="text-muted-foreground text-center text-sm">
                Set a budget and this becomes "safe to spend"
              </p>
            )
          )}
        </div>

        {/* One alert surfaced, the rest collapsed behind a review sheet */}
        {topAttention && (
          <button
            onClick={() => setAlertsOpen(true)}
            className="bg-warning-band w-full rounded-md p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-warning-band-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-warning-band-foreground text-sm font-semibold">
                  {describeAttention(topAttention)}
                </p>
                {attentionItems.length > 1 && (
                  <p className="text-warning-band-foreground mt-0.5 text-xs opacity-80">
                    {attentionItems.length - 1} more thing
                    {attentionItems.length - 1 === 1 ? '' : 's'} need attention this week
                  </p>
                )}
              </div>
              <span className="text-warning-band-accent shrink-0 text-xs font-semibold">
                Review
              </span>
            </div>
          </button>
        )}

        <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Needs attention</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground -mt-2 text-xs">
              This week only. Everything else is fine.
            </p>
            <div className="-mx-4 max-h-96 overflow-y-auto">
              {attentionItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => goToAttentionItem(item)}
                  className="border-border hover:bg-muted/40 flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {describeAttention(item)}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {attentionDetail(item)}
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Savings goals — furthest along, not yet complete */}
        {topGoals.length > 0 && (
          <button
            onClick={() => navigate('/goals')}
            className="card-elevated w-full rounded-md p-4 text-left"
          >
            <div className="mb-3 flex items-center gap-2">
              <PiggyBank size={16} className="text-primary" />
              <span className="text-sm font-semibold">Savings Goals</span>
              <ChevronRight size={14} className="text-muted-foreground ml-auto" />
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
                        backgroundColor: 'var(--primary)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* Debts & lending — biggest open balances */}
        {topDebts.length > 0 && (
          <button
            onClick={() => navigate('/debts')}
            className="card-elevated w-full rounded-md p-4 text-left"
          >
            <div className="mb-3 flex items-center gap-2">
              <HandCoins size={16} className="text-primary" />
              <span className="text-sm font-semibold">Debts & Lending</span>
              <ChevronRight size={14} className="text-muted-foreground ml-auto" />
            </div>
            <div className="divide-border divide-y">
              {topDebts.map((s) => (
                <div
                  key={s.person.id}
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <PersonIcon icon={s.person.icon} size={14} color={s.person.color} />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{s.person.name}</p>
                  <p
                    className={`shrink-0 text-xs font-semibold ${s.balance > 0 ? 'text-primary' : 'text-destructive'}`}
                  >
                    {s.balance > 0 ? 'Owes you ' : 'You owe '}
                    {formatCurrency(Math.abs(s.balance), true, hideAmounts)}
                  </p>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* Where it sits */}
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Where it sits
            </h2>
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
              className="border-border hover:bg-muted flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 transition-colors"
            >
              <Plus size={24} className="text-primary" />
              <span className="text-primary text-sm font-medium">Add your first account</span>
              <span className="text-muted-foreground text-center text-xs">
                You need at least one account to record transactions.
              </span>
            </button>
          ) : (
            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-x-visible">
              {openAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => navigate(`/edit-account/${account.id}`)}
                  className="card-elevated min-w-32.5 shrink-0 rounded-md p-3 text-left lg:min-w-0"
                >
                  <p className="text-muted-foreground truncate text-xs">{account.name}</p>
                  <p
                    className={`mt-0.5 text-sm font-semibold ${account.balance < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatCurrency(account.balance, true, hideAmounts, {
                      forceCompact: accountsCompact,
                    })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>

        {/* Recent Transactions */}
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              <Sparkles size={14} className="text-primary" /> Latest
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
            <div className="card-elevated divide-border divide-y rounded-md">
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
