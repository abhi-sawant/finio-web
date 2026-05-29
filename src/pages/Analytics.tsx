import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Target, ChevronRight, Repeat } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import {
  getCurrentMonthTransactions,
  getTotalIncome,
  getTotalExpenses,
} from '@/utils/calculations';
import { SpendingDonut } from '@/components/charts/SpendingDonut';
import { IncomeExpenseBar } from '@/components/charts/IncomeExpenseBar';
import { BalanceTrend } from '@/components/charts/BalanceTrend';
import { LabelSpendingBar } from '@/components/charts/LabelSpendingBar';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

export default function Analytics() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const currency = useFinanceStore((s) => s.settings.currency);
  const budgets = useFinanceStore((s) => s.budgets);
  const recurring = useFinanceStore((s) => s.recurring);

  const monthTxns = useMemo(() => getCurrentMonthTransactions(transactions), [transactions]);
  const monthIncome = useMemo(() => getTotalIncome(monthTxns), [monthTxns]);
  const monthExpenses = useMemo(() => getTotalExpenses(monthTxns), [monthTxns]);
  const net = monthIncome - monthExpenses;

  return (
    <>
      <Header>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
      </Header>

      <Main>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Add transactions to see analytics
          </p>
        ) : (
          <>
            {/* Month Summary */}
            <div className="card-elevated bg-grad-surface rounded-2xl p-4">
              <p className="text-muted-foreground mb-2 text-[10px] tracking-wide uppercase">
                This Month
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Income
                  </p>
                  <p className="text-sm font-semibold text-emerald-500">
                    {formatCurrency(monthIncome, currency, true)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Expenses
                  </p>
                  <p className="text-sm font-semibold text-rose-500">
                    {formatCurrency(monthExpenses, currency, true)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">Net</p>
                  <p
                    className={`text-sm font-semibold ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {formatCurrency(net, currency, true)}
                  </p>
                </div>
              </div>
            </div>

            {/* Spending by Category */}
            <SpendingDonut />

            {/* Income vs Expense Bar */}
            <IncomeExpenseBar />

            {/* Balance Trend */}
            <BalanceTrend />

            {/* Label Spending */}
            <LabelSpendingBar />
          </>
        )}

        {/* Tools */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <button
            onClick={() => navigate('/budgets')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <div className="bg-grad-primary-soft flex h-9 w-9 items-center justify-center rounded-full">
                <Target size={16} className="text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Budgets</p>
                <p className="text-muted-foreground text-xs">
                  {budgets.length === 0 ? 'Set monthly limits' : `${budgets.length} active`}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/recurring')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <div className="bg-grad-info flex h-9 w-9 items-center justify-center rounded-full">
                <Repeat size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Recurring Transactions</p>
                <p className="text-muted-foreground text-xs">
                  {recurring.length === 0
                    ? 'Automate repeating items'
                    : `${recurring.length} active`}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </div>
      </Main>
    </>
  );
}
