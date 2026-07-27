import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  History,
  Pencil,
  Plus,
  Tag,
  Target,
  Trash2,
} from 'lucide-react';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { BudgetHealthBadge, BudgetProgressBar } from '@/components/budgets/BudgetHealthBadge';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency } from '@/utils/formatters';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import { SwitchField } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/use-confirm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  budgetScopeKey,
  computeBudgetHistory,
  computeBudgetStatuses,
  type BudgetStatus,
} from '@/utils/calculations';
import {
  PERIOD_LABELS,
  PERIOD_TYPES,
  normalizeMonthStartDay,
  periodLabel,
  periodShortLabel,
} from '@/utils/period';
import type { Budget, BudgetPeriod } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const OVERALL_SCOPE = '__overall__';

/** How the scope select encodes its options — categories and labels share one list. */
function encodeScope(budget: Pick<Budget, 'categoryId' | 'labelId'>): string {
  if (budget.labelId) return `lbl:${budget.labelId}`;
  return budget.categoryId === '' ? OVERALL_SCOPE : `cat:${budget.categoryId}`;
}

function decodeScope(value: string): Pick<Budget, 'categoryId' | 'labelId'> {
  if (value.startsWith('lbl:')) return { categoryId: '', labelId: value.slice(4) };
  if (value.startsWith('cat:')) return { categoryId: value.slice(4) };
  return { categoryId: '' };
}

/** Per-period wording, so a weekly budget doesn't say "left this month". */
const PERIOD_NOUN: Record<BudgetPeriod, string> = {
  weekly: 'this week',
  monthly: 'this month',
  yearly: 'this year',
};

export default function Budgets() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const labels = useFinanceStore((s) => s.labels);
  const transactions = useFinanceStore((s) => s.transactions);
  const addBudget = useFinanceStore((s) => s.addBudget);
  const updateBudget = useFinanceStore((s) => s.updateBudget);
  const deleteBudget = useFinanceStore((s) => s.deleteBudget);
  const monthStartDay = normalizeMonthStartDay(useFinanceStore((s) => s.settings.monthStartDay));

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scope, setScope] = useState<string>(OVERALL_SCOPE);
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [rollover, setRollover] = useState(false);
  const [amount, setAmount] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' || c.type === 'both'),
    [categories],
  );

  const statuses = useMemo(
    () => computeBudgetStatuses(budgets, transactions, { monthStartDay }),
    [budgets, transactions, monthStartDay],
  );

  // Overall first, then whatever is closest to its limit.
  const sortedStatuses = useMemo(
    () =>
      [...statuses].sort((a, b) => {
        const aOverall = !a.budget.labelId && a.budget.categoryId === '';
        const bOverall = !b.budget.labelId && b.budget.categoryId === '';
        if (aOverall !== bOverall) return aOverall ? -1 : 1;
        return b.percent - a.percent;
      }),
    [statuses],
  );

  const describe = (budget: Pick<Budget, 'categoryId' | 'labelId'>) => {
    if (budget.labelId) {
      const label = labels.find((l) => l.id === budget.labelId);
      return { name: label?.name ?? 'Unknown label', color: label?.color ?? '#94a3b8' };
    }
    if (budget.categoryId === '') return { name: 'Overall Expenses', color: '#7c5cff' };
    const cat = expenseCategories.find((c) => c.id === budget.categoryId);
    return { name: cat?.name ?? 'Unknown', color: cat?.color ?? '#94a3b8' };
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setScope(OVERALL_SCOPE);
    setPeriod('monthly');
    setRollover(false);
    setAmount('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (budget: Budget) => {
    setEditingId(budget.id);
    setScope(encodeScope(budget));
    setPeriod(budget.period);
    setRollover(budget.rollover);
    setAmount(String(budget.amount));
    setShowForm(true);
  };

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error('Enter a valid budget amount');
      return;
    }

    const decoded = decodeScope(scope);
    const clash = budgets.find(
      (b) => b.id !== editingId && budgetScopeKey(b) === budgetScopeKey(decoded),
    );
    if (clash) {
      toast.error(`${describe(clash).name} already has a budget`);
      return;
    }

    if (editingId) {
      updateBudget(editingId, {
        categoryId: decoded.categoryId,
        labelId: decoded.labelId,
        amount: parsed,
        period,
        rollover,
      });
      toast.success('Budget updated');
    } else {
      addBudget({ ...decoded, amount: parsed, period, rollover });
      toast.success('Budget saved');
    }
    resetForm();
  };

  return (
    <>
      {/* Header */}
      <Header innerClassName="lg:max-w-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Budgets</h1>
        <div className="flex gap-1">
          <HideAmountsToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (showForm ? resetForm() : startCreate())}
            className="text-primary hover:bg-primary/10 h-9 w-9 rounded-full"
            aria-label="Add budget"
          >
            <Plus size={20} />
          </Button>
        </div>
      </Header>

      <Main className="lg:max-w-xl">
        {showForm && (
          <div className="card-elevated space-y-3 rounded-2xl p-4">
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Scope
              </Label>
              <Select value={scope} onValueChange={(v) => setScope(v ?? OVERALL_SCOPE)}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue>{describe(decodeScope(scope)).name}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value={OVERALL_SCOPE}>Overall (all expenses)</SelectItem>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={`cat:${c.id}`}>
                      {c.name}
                    </SelectItem>
                  ))}
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={`lbl:${l.id}`}>
                      Label · {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Period
              </Label>
              <div className="bg-muted grid grid-cols-3 gap-2 rounded-xl p-1">
                {PERIOD_TYPES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-lg py-2 text-xs font-medium transition-all ${
                      period === p ? 'bg-grad-primary text-white shadow' : 'text-muted-foreground'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                {PERIOD_LABELS[period]} Limit
              </Label>
              <NumberPad value={amount} onChange={setAmount} />
            </div>

            <SwitchField
              title="Roll over unspent"
              description="Carry what's left (or overspent) into the next period"
              checked={rollover}
              onCheckedChange={setRollover}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                {editingId ? 'Save Changes' : 'Save'}
              </Button>
              <Button
                variant="secondary"
                onClick={resetForm}
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
              onClick={startCreate}
              className="bg-grad-primary shadow-glow-primary h-auto rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Create your first budget
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedStatuses.map((s) => (
              <BudgetCard
                key={s.budget.id}
                status={s}
                monthStartDay={monthStartDay}
                scopeName={describe(s.budget).name}
                scopeColor={describe(s.budget).color}
                icon={
                  s.budget.labelId ? (
                    <Tag size={16} color="white" />
                  ) : s.budget.categoryId === '' ? (
                    <Target size={16} color="white" />
                  ) : (
                    <CategoryIcon
                      icon={
                        expenseCategories.find((c) => c.id === s.budget.categoryId)?.icon ??
                        'circle-ellipsis'
                      }
                      size={16}
                      color="white"
                    />
                  )
                }
                expanded={expandedId === s.budget.id}
                onToggleHistory={() =>
                  setExpandedId((id) => (id === s.budget.id ? null : s.budget.id))
                }
                onEdit={() => startEdit(s.budget)}
                onDelete={async () => {
                  const confirmed = await confirm({
                    title: `Delete budget for "${describe(s.budget).name}"?`,
                    description: 'Your transactions are unaffected — only the limit is removed.',
                    confirmLabel: 'Delete budget',
                  });
                  if (confirmed) deleteBudget(s.budget.id);
                }}
              />
            ))}
          </div>
        )}
      </Main>
    </>
  );
}

interface BudgetCardProps {
  status: BudgetStatus;
  monthStartDay: number;
  scopeName: string;
  scopeColor: string;
  icon: ReactNode;
  expanded: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function BudgetCard({
  status,
  monthStartDay,
  scopeName,
  scopeColor,
  icon,
  expanded,
  onToggleHistory,
  onEdit,
  onDelete,
}: BudgetCardProps) {
  const transactions = useFinanceStore((s) => s.transactions);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const { budget } = status;

  const history = useMemo(
    () => (expanded ? computeBudgetHistory(budget, transactions, { monthStartDay }, 6) : []),
    [expanded, budget, transactions, monthStartDay],
  );

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundImage: `linear-gradient(135deg, ${scopeColor}, ${scopeColor}cc)` }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{scopeName}</p>
            <p className="text-muted-foreground truncate text-[11px]">
              {PERIOD_LABELS[budget.period]} · {periodLabel(status.range, monthStartDay)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-7 w-7"
            aria-label="Edit"
          >
            <Pencil size={13} className="text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-7 w-7"
            aria-label="Delete"
          >
            <Trash2 size={13} className="text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className={status.isOver ? 'font-medium text-rose-500' : 'text-muted-foreground'}>
          {formatCurrency(status.spent, false, hideAmounts)} of{' '}
          {formatCurrency(status.limit, false, hideAmounts)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <BudgetHealthBadge status={status} />
          <span
            className={`font-medium ${status.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}
          >
            {Math.round(status.percent)}%
          </span>
        </span>
      </div>
      <BudgetProgressBar
        status={status}
        okFill={`linear-gradient(90deg, ${scopeColor}, ${scopeColor}cc)`}
        valueText={`${formatCurrency(status.spent, false, hideAmounts)} of ${formatCurrency(
          status.limit,
          false,
          hideAmounts,
        )} spent`}
      />
      <p className="text-muted-foreground mt-1.5 text-[11px]">
        {status.isOver
          ? `Over by ${formatCurrency(-status.remaining, false, hideAmounts)}`
          : `${formatCurrency(status.remaining, false, hideAmounts)} left ${PERIOD_NOUN[budget.period]}`}
      </p>
      {budget.rollover && status.carryover !== 0 && (
        <p className="text-[11px] text-amber-500">
          {status.carryover > 0
            ? `Includes ${formatCurrency(status.carryover, false, hideAmounts)} rolled over`
            : `Includes ${formatCurrency(-status.carryover, false, hideAmounts)} overspend carried in`}
        </p>
      )}

      <button
        onClick={onToggleHistory}
        className="text-muted-foreground mt-2 flex items-center gap-1 text-[11px] font-medium"
        aria-expanded={expanded}
      >
        <History size={12} />
        History
        <ChevronDown
          size={12}
          className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {expanded && (
        <div className="border-border mt-2 space-y-1.5 border-t pt-2">
          {history.length === 0 ? (
            <p className="text-muted-foreground text-[11px]">
              No completed periods yet — this budget started{' '}
              {periodLabel(status.range, monthStartDay)}.
            </p>
          ) : (
            history.map((h) => (
              <div
                key={h.range.start.toISOString()}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="text-muted-foreground w-14 shrink-0">
                  {periodShortLabel(h.range)}
                </span>
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${h.limit > 0 ? Math.min((h.spent / h.limit) * 100, 100) : 0}%`,
                      backgroundImage: h.isOver ? 'var(--grad-danger)' : 'var(--grad-success)',
                    }}
                  />
                </div>
                <span
                  className={`flex w-32 shrink-0 items-center justify-end gap-1 text-right ${h.isOver ? 'text-rose-500' : 'text-muted-foreground'}`}
                >
                  {h.isOver ? (
                    <AlertTriangle size={10} aria-label="Over budget" />
                  ) : (
                    <Check size={10} aria-label="Within budget" />
                  )}
                  {formatCurrency(h.spent, true, hideAmounts)} /{' '}
                  {formatCurrency(h.limit, true, hideAmounts)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
