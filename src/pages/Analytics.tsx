import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Target, ChevronRight, Repeat, CalendarIcon } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { getTotalIncome, getTotalExpenses } from '@/utils/calculations';
import { SpendingDonut } from '@/components/charts/SpendingDonut';
import { IncomeExpenseBar } from '@/components/charts/IncomeExpenseBar';
import { BalanceTrend } from '@/components/charts/BalanceTrend';
import { LabelSpendingBar } from '@/components/charts/LabelSpendingBar';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, parseISO, startOfMonth, startOfDay, endOfDay, subMonths } from 'date-fns';

type FilterType = 'all' | 'month' | '3months' | '6months' | 'year' | 'custom';

export default function Analytics() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const currency = useFinanceStore((s) => s.settings.currency);
  const budgets = useFinanceStore((s) => s.budgets);
  const recurring = useFinanceStore((s) => s.recurring);

  const [selectedFilter, setSelectedFilter] = useState<FilterType>('month');
  const [date, setDate] = React.useState<DateRange | undefined>(undefined);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (selectedFilter === 'month') return { from: startOfMonth(now), to: now };
    if (selectedFilter === '3months') return { from: startOfMonth(subMonths(now, 2)), to: now };
    if (selectedFilter === '6months') return { from: startOfMonth(subMonths(now, 5)), to: now };
    if (selectedFilter === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: now };
    if (selectedFilter === 'custom' && date?.from) {
      return { from: startOfDay(date.from), to: date.to ? endOfDay(date.to) : endOfDay(date.from) };
    }
    // 'all': use earliest transaction date
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    return { from: sorted.length > 0 ? startOfDay(parseISO(sorted[0].date)) : startOfMonth(now), to: now };
  }, [selectedFilter, date, transactions]);

  const filteredTransactions = useMemo(() => {
    if (selectedFilter === 'all') return transactions;
    if (selectedFilter === 'custom' && !date?.from) return transactions;
    const { from, to } = dateRange;
    return transactions.filter((t) => {
      const d = parseISO(t.date);
      return d >= from && d <= to;
    });
  }, [selectedFilter, transactions, dateRange, date]);

  const totalIncome = useMemo(() => getTotalIncome(filteredTransactions), [filteredTransactions]);
  const totalExpenses = useMemo(() => getTotalExpenses(filteredTransactions), [filteredTransactions]);
  const net = totalIncome - totalExpenses;

  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    if (filter !== 'custom') setDate(undefined);
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDate(range);
    if (range?.from) setSelectedFilter('custom');
  };

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
            <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto py-2">
              <Button
                variant={selectedFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('all')}
              >
                All
              </Button>
              <Button
                variant={selectedFilter === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('month')}
              >
                This Month
              </Button>
              <Button
                variant={selectedFilter === '3months' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('3months')}
              >
                Last 3 Months
              </Button>
              <Button
                variant={selectedFilter === '6months' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('6months')}
              >
                Last 6 Months
              </Button>
              <Button
                variant={selectedFilter === 'year' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange('year')}
              >
                This Year
              </Button>
              <Popover>
                <PopoverTrigger>
                  <Button
                    variant={selectedFilter === 'custom' ? 'default' : 'outline'}
                    id="date-picker-range"
                    className="justify-start px-2.5 font-normal"
                  >
                    <CalendarIcon />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(date.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={handleDateSelect}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {/* Period Summary */}
            <div className="card-elevated bg-grad-surface rounded-2xl p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Income
                  </p>
                  <p className="text-sm font-semibold text-emerald-500">
                    {formatCurrency(totalIncome, currency, true)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    Expenses
                  </p>
                  <p className="text-sm font-semibold text-rose-500">
                    {formatCurrency(totalExpenses, currency, true)}
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
            <SpendingDonut transactions={filteredTransactions} />

            {/* Income vs Expense Bar */}
            <IncomeExpenseBar transactions={filteredTransactions} />

            {/* Balance Trend */}
            <BalanceTrend from={dateRange.from} to={dateRange.to} />

            {/* Label Spending */}
            <LabelSpendingBar transactions={filteredTransactions} />
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
