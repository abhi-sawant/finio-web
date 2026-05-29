import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Target } from 'lucide-react';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCurrentMonthTransactions, computeBudgetStatuses } from '@/utils/calculations';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

export default function Budgets() {
  const navigate = useNavigate();
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const currency = useFinanceStore((s) => s.settings.currency);
  const addBudget = useFinanceStore((s) => s.addBudget);
  const deleteBudget = useFinanceStore((s) => s.deleteBudget);

  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' || c.type === 'both'),
    [categories],
  );

  const monthTxns = useMemo(() => getCurrentMonthTransactions(transactions), [transactions]);
  const statuses = useMemo(() => computeBudgetStatuses(budgets, monthTxns), [budgets, monthTxns]);

  // Show overall first, then per-category
  const sortedStatuses = useMemo(
    () =>
      [...statuses].sort((a, b) => {
        if (a.budget.categoryId === '') return -1;
        if (b.budget.categoryId === '') return 1;
        return b.percent - a.percent;
      }),
    [statuses],
  );

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error('Enter a valid budget amount');
      return;
    }
    addBudget({ categoryId, amount: parsed });
    toast.success('Budget saved');
    setShowForm(false);
    setAmount('');
    setCategoryId('');
  };

  return (
    <>
      {/* Header */}
      <Header>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Budgets</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowForm((v) => !v)}
          className="text-primary hover:bg-primary/10 h-9 w-9 rounded-full"
          aria-label="Add budget"
        >
          <Plus size={20} />
        </Button>
      </Header>

      <Main>
        {showForm && (
          <div className="card-elevated space-y-3 rounded-2xl p-4">
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Scope
              </Label>
              <Select
                value={categoryId === '' ? '__overall__' : categoryId}
                onValueChange={(v) => setCategoryId(v === '__overall__' || v === null ? '' : v)}
              >
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__overall__">Overall (all expenses)</SelectItem>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Monthly Limit
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-muted h-auto rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setAmount('');
                  setCategoryId('');
                }}
                className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {sortedStatuses.length === 0 ? (
          <div className="py-12 text-center">
            <div className="bg-grad-primary-soft mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full">
              <Target size={22} className="text-primary" />
            </div>
            <p className="text-muted-foreground mb-4">No budgets yet</p>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-grad-primary shadow-glow-primary h-auto rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Create your first budget
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedStatuses.map((s) => {
              const cat = expenseCategories.find((c) => c.id === s.budget.categoryId);
              const isOverall = s.budget.categoryId === '';
              const color = isOverall ? '#7c5cff' : (cat?.color ?? '#94a3b8');
              const label = isOverall ? 'Overall Expenses' : (cat?.name ?? 'Unknown');

              return (
                <div key={s.budget.id} className="card-elevated rounded-2xl p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                      >
                        {isOverall ? (
                          <Target size={16} color="white" />
                        ) : (
                          <CategoryIcon
                            icon={cat?.icon ?? 'circle-ellipsis'}
                            size={16}
                            color="white"
                          />
                        )}
                      </div>
                      <p className="truncate text-sm font-medium">{label}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete budget for "${label}"?`)) deleteBudget(s.budget.id);
                      }}
                      className="h-7 w-7"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span
                      className={`${s.isOver ? 'font-medium text-rose-500' : 'text-muted-foreground'}`}
                    >
                      {formatCurrency(s.spent, currency)} of{' '}
                      {formatCurrency(s.budget.amount, currency)}
                    </span>
                    <span
                      className={`font-medium ${s.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}
                    >
                      {Math.round(s.percent)}%
                    </span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(s.percent, 100)}%`,
                        backgroundImage: s.isOver
                          ? 'var(--grad-danger)'
                          : s.percent > 80
                            ? 'var(--grad-warning)'
                            : `linear-gradient(90deg, ${color}, ${color}cc)`,
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-[11px]">
                    {s.isOver
                      ? `Over by ${formatCurrency(-s.remaining, currency)}`
                      : `${formatCurrency(s.remaining, currency)} left this month`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Main>
    </>
  );
}
