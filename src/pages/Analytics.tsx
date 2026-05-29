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
    <div className="px-4 pb-6 safe-top">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>

      {transactions.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-12">
          Add transactions to see analytics
        </p>
      ) : (
        <>
          {/* Month Summary */}
          <div className="rounded-2xl p-4 card-elevated bg-grad-surface">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">This Month</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Income</p>
                <p className="text-sm font-semibold text-emerald-500">{formatCurrency(monthIncome, currency, true)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expenses</p>
                <p className="text-sm font-semibold text-rose-500">{formatCurrency(monthExpenses, currency, true)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Net</p>
                <p className={`text-sm font-semibold ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
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
      <div className="card-elevated rounded-2xl divide-y divide-border">
        <button
          onClick={() => navigate('/budgets')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-grad-primary-soft flex items-center justify-center">
              <Target size={16} className="text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Budgets</p>
              <p className="text-xs text-muted-foreground">
                {budgets.length === 0 ? 'Set monthly limits' : `${budgets.length} active`}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/recurring')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-grad-info flex items-center justify-center">
              <Repeat size={16} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Recurring Transactions</p>
              <p className="text-xs text-muted-foreground">
                {recurring.length === 0 ? 'Automate repeating items' : `${recurring.length} active`}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

