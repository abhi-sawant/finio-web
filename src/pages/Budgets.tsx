import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Target } from 'lucide-react';
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
import {
  getCurrentMonthTransactions,
  computeBudgetStatuses,
} from '@/utils/calculations';

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
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border safe-top">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Budgets</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowForm((v) => !v)}
          className="w-9 h-9 text-primary rounded-full hover:bg-primary/10"
          aria-label="Add budget"
        >
          <Plus size={20} />
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {showForm && (
          <div className="rounded-2xl p-4 card-elevated space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Scope</Label>
              <Select
                value={categoryId === '' ? '__overall__' : categoryId}
                onValueChange={(v) => setCategoryId(v === '__overall__' || v === null ? '' : v)}
              >
                <SelectTrigger className="w-full h-auto px-3 py-2 bg-muted rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__overall__">Overall (all expenses)</SelectItem>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Monthly Limit</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-auto px-3 py-2 bg-muted rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 h-auto py-2 bg-grad-primary text-white rounded-lg text-sm font-medium shadow-glow-primary"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowForm(false); setAmount(''); setCategoryId(''); }}
                className="h-auto px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {sortedStatuses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-grad-primary-soft flex items-center justify-center mx-auto mb-3">
              <Target size={22} className="text-primary" />
            </div>
            <p className="text-muted-foreground mb-4">No budgets yet</p>
            <Button
              onClick={() => setShowForm(true)}
              className="h-auto bg-grad-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-glow-primary"
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
                <div key={s.budget.id} className="rounded-2xl p-4 card-elevated">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                      >
                        {label.charAt(0)}
                      </div>
                      <p className="text-sm font-medium truncate">{label}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete budget for "${label}"?`)) deleteBudget(s.budget.id);
                      }}
                      className="w-7 h-7"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className={`${s.isOver ? 'text-rose-500 font-medium' : 'text-muted-foreground'}`}>
                      {formatCurrency(s.spent, currency)} of {formatCurrency(s.budget.amount, currency)}
                    </span>
                    <span className={`font-medium ${s.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}>
                      {Math.round(s.percent)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
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
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {s.isOver
                      ? `Over by ${formatCurrency(-s.remaining, currency)}`
                      : `${formatCurrency(s.remaining, currency)} left this month`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
