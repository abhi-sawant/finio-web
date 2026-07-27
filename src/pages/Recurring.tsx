import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { ArrowLeft, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import {
  isRulePaused,
  lastOccurrenceOnOrBefore,
  nextDueDate,
  previewBackfill,
  type BackfillPreview,
} from '@/store/recurring';
import { formatCurrency, toLocalDateTimeInputValue } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import { useConfirm } from '@/components/ui/use-confirm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { activeAccounts } from '@/utils/calculations';
import type { RecurrenceFrequency, RecurringTransaction, TransactionType } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const FREQ_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

type EndMode = 'never' | 'on' | 'after';

/**
 * Below this, a backfill isn't worth interrupting for — creating a rule dated today has always
 * generated today's transaction straight away.
 */
const BACKFILL_PROMPT_THRESHOLD = 2;

/** The rule the form currently describes, plus how it should be committed. */
interface PendingRule {
  rule: RecurringTransaction;
  editingId: string | null;
  preview: BackfillPreview;
}

export default function Recurring() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const recurring = useFinanceStore((s) => s.recurring);
  const allAccounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  // A closed account cannot take new charges, so it must not back a new rule. Existing rules
  // still resolve their account name from the full list below.
  const accounts = useMemo(() => activeAccounts(allAccounts), [allAccounts]);
  const addRecurring = useFinanceStore((s) => s.addRecurring);
  const updateRecurring = useFinanceStore((s) => s.updateRecurring);
  const setRecurringPaused = useFinanceStore((s) => s.setRecurringPaused);
  const deleteRecurring = useFinanceStore((s) => s.deleteRecurring);
  const processRecurring = useFinanceStore((s) => s.processRecurring);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [startDate, setStartDate] = useState(toLocalDateTimeInputValue(new Date()));
  const [endMode, setEndMode] = useState<EndMode>('never');
  const [endDate, setEndDate] = useState('');
  const [maxOccurrences, setMaxOccurrences] = useState('');
  const [pending, setPending] = useState<PendingRule | null>(null);

  const filteredCategories = useMemo(
    () =>
      type === 'transfer'
        ? categories.filter((c) => c.type === 'both')
        : categories.filter((c) => c.type === type || c.type === 'both'),
    [categories, type],
  );

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setType('expense');
    setAmount('');
    setAccountId(accounts[0]?.id ?? '');
    setToAccountId('');
    setCategoryId('');
    setNote('');
    setFrequency('monthly');
    setStartDate(toLocalDateTimeInputValue(new Date()));
    setEndMode('never');
    setEndDate('');
    setMaxOccurrences('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (rule: RecurringTransaction) => {
    setEditingId(rule.id);
    setType(rule.type);
    setAmount(String(rule.amount));
    setAccountId(rule.accountId);
    setToAccountId(rule.toAccountId ?? '');
    setCategoryId(rule.categoryId);
    setNote(rule.note);
    setFrequency(rule.frequency);
    setStartDate(toLocalDateTimeInputValue(rule.startDate));
    setEndMode(rule.endDate ? 'on' : rule.maxOccurrences !== undefined ? 'after' : 'never');
    setEndDate(rule.endDate ? rule.endDate.slice(0, 10) : '');
    setMaxOccurrences(rule.maxOccurrences !== undefined ? String(rule.maxOccurrences) : '');
    setShowForm(true);
  };

  /** Build the rule the form describes, or return the first validation error. */
  const buildRule = (): RecurringTransaction | string => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return 'Enter a valid amount';
    if (!accountId) return 'Select an account';

    if (type === 'transfer') {
      if (!toAccountId) return 'Select a destination account';
      if (toAccountId === accountId) return 'Choose two different accounts';
    } else if (!categoryId) {
      return 'Select a category';
    }

    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return 'Pick a valid start date';

    let resolvedEndDate: string | undefined;
    let resolvedMax: number | undefined;
    if (endMode === 'on') {
      if (!endDate) return 'Pick an end date';
      // The picker gives a date only — run the rule through the end of that day.
      const end = new Date(`${endDate}T23:59:59`);
      if (Number.isNaN(end.getTime())) return 'Pick a valid end date';
      if (end.getTime() < start.getTime()) return 'The end date is before the start date';
      resolvedEndDate = end.toISOString();
    } else if (endMode === 'after') {
      const count = parseInt(maxOccurrences, 10);
      if (!Number.isFinite(count) || count < 1) return 'Enter how many times it should run';
      resolvedMax = count;
    }

    const existing = editingId ? recurring.find((r) => r.id === editingId) : undefined;
    const transferCategory = categories.find((c) => c.type === 'both');

    return {
      id: existing?.id ?? 'draft',
      type,
      amount: parsed,
      accountId,
      categoryId: type === 'transfer' ? (transferCategory?.id ?? categoryId ?? '') : categoryId,
      note,
      labels: existing?.labels ?? [],
      frequency,
      startDate: start.toISOString(),
      occurrenceCount: existing?.occurrenceCount ?? 0,
      lastRunDate: existing?.lastRunDate ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(type === 'transfer' ? { toAccountId } : {}),
      ...(resolvedEndDate ? { endDate: resolvedEndDate } : {}),
      ...(resolvedMax !== undefined ? { maxOccurrences: resolvedMax } : {}),
      ...(existing?.pausedAt ? { pausedAt: existing.pausedAt } : {}),
    };
  };

  const commit = (rule: RecurringTransaction, ruleEditingId: string | null, skipPast: boolean) => {
    // Skipping the backfill parks the schedule on the last occurrence that has already passed,
    // so the rule stays anchored to its start date but generates nothing for the past.
    const lastRunDate = skipPast
      ? (lastOccurrenceOnOrBefore(rule, new Date())?.toISOString() ?? rule.lastRunDate)
      : rule.lastRunDate;

    // Written out field by field so clearing "ends on" / "ends after" (or switching away from a
    // transfer) actually unsets the old value instead of leaving it behind.
    const fields = {
      type: rule.type,
      amount: rule.amount,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId,
      categoryId: rule.categoryId,
      note: rule.note,
      labels: rule.labels,
      frequency: rule.frequency,
      startDate: rule.startDate,
      endDate: rule.endDate,
      maxOccurrences: rule.maxOccurrences,
      lastRunDate,
    };

    if (ruleEditingId) {
      updateRecurring(ruleEditingId, fields);
    } else {
      addRecurring(fields);
    }

    const generated = processRecurring();
    toast.success(
      `${ruleEditingId ? 'Rule updated' : 'Recurring rule created'}${
        generated > 0 ? ` · added ${generated} transaction${generated === 1 ? '' : 's'}` : ''
      }`,
    );
    setPending(null);
    resetForm();
  };

  const handleSubmit = () => {
    const built = buildRule();
    if (typeof built === 'string') {
      toast.error(built);
      return;
    }

    const preview = previewBackfill(
      built,
      accounts.map((a) => a.id),
      new Date(),
    );

    // A rule dated in the past moves real balances — show what it will do before it does it.
    if (preview.count >= BACKFILL_PROMPT_THRESHOLD) {
      setPending({ rule: built, editingId, preview });
      return;
    }
    commit(built, editingId, false);
  };

  const accountName = (id: string | undefined) =>
    allAccounts.find((a) => a.id === id)?.name ?? 'Unknown';

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
        <h1 className="text-base font-semibold">Recurring</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (showForm ? resetForm() : startCreate())}
          disabled={accounts.length === 0}
          className="text-primary hover:bg-primary/10 h-9 w-9 rounded-full disabled:opacity-30"
          aria-label="Add recurring"
        >
          <Plus size={20} />
        </Button>
      </Header>

      <Main className="lg:max-w-xl">
        {accounts.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Add an account first to create recurring rules.
          </p>
        )}

        {showForm && (
          <div className="card-elevated space-y-3 rounded-2xl p-4">
            <div className="bg-muted grid grid-cols-3 gap-2 rounded-xl p-1">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    setCategoryId('');
                  }}
                  className={`rounded-lg py-2 text-xs font-medium capitalize transition-all ${
                    type === t
                      ? t === 'expense'
                        ? 'bg-grad-danger text-white shadow'
                        : t === 'income'
                          ? 'bg-grad-success text-white shadow'
                          : 'bg-grad-info text-white shadow'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Amount
              </Label>
              <NumberPad value={amount} onChange={setAmount} />
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                {type === 'transfer' ? 'From Account' : 'Account'}
              </Label>
              <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue placeholder="Account">
                    {accounts.find((a) => a.id === accountId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === 'transfer' ? (
              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  To Account
                </Label>
                <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
                  <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                    <SelectValue placeholder="Destination">
                      {accounts.find((a) => a.id === toAccountId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue placeholder="Category">
                    {filteredCategories.find((c) => c.id === categoryId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Input
              type="text"
              placeholder="Note (e.g., Netflix)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-muted h-auto rounded-lg px-3 py-2"
            />

            <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                <SelectValue placeholder="Frequency">{FREQ_LABEL[frequency]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQ_LABEL) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Starts
              </Label>
              <DateTimePicker
                value={startDate}
                onChange={setStartDate}
                inputClassName="h-auto px-3 py-2 bg-muted rounded-lg"
              />
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Ends</Label>
              <Select value={endMode} onValueChange={(v) => setEndMode((v as EndMode) ?? 'never')}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue>
                    {endMode === 'never'
                      ? 'Never'
                      : endMode === 'on'
                        ? 'On a date'
                        : 'After N times'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="on">On a date</SelectItem>
                  <SelectItem value="after">After N times</SelectItem>
                </SelectContent>
              </Select>
              {endMode === 'on' && (
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="End date"
                  className="mt-2"
                />
              )}
              {endMode === 'after' && (
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Number of occurrences"
                  value={maxOccurrences}
                  onChange={(e) => setMaxOccurrences(e.target.value)}
                  className="bg-muted mt-2 h-auto rounded-lg px-3 py-2"
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                {editingId ? 'Save Changes' : 'Save Rule'}
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

        {recurring.length === 0 && !showForm && accounts.length > 0 && (
          <div className="py-12 text-center">
            <div className="bg-grad-info mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full">
              <Repeat size={22} className="text-white" />
            </div>
            <p className="text-muted-foreground mb-4">No recurring rules yet</p>
            <Button
              onClick={startCreate}
              className="bg-grad-primary shadow-glow-primary h-auto rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Create a rule
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {recurring.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const color = r.type === 'transfer' ? '#3b82f6' : (cat?.color ?? '#94a3b8');
            const paused = isRulePaused(r);
            const nextDue = nextDueDate(r);

            const schedule = paused
              ? 'Paused'
              : nextDue
                ? `Next ${format(nextDue, 'd MMM yyyy')}`
                : 'Ended';
            const limit =
              r.maxOccurrences !== undefined
                ? `${r.occurrenceCount} of ${r.maxOccurrences}`
                : r.endDate
                  ? `until ${format(new Date(r.endDate), 'd MMM yyyy')}`
                  : null;

            return (
              <div key={r.id} className="card-elevated rounded-2xl p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white ${paused ? 'opacity-50' : ''}`}
                    style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                  >
                    <Repeat size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.note || cat?.name || 'Recurring'}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {FREQ_LABEL[r.frequency]} ·{' '}
                      {r.type === 'transfer'
                        ? `${accountName(r.accountId)} → ${accountName(r.toAccountId)}`
                        : accountName(r.accountId)}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      r.type === 'income'
                        ? 'text-emerald-500'
                        : r.type === 'transfer'
                          ? 'text-blue-500'
                          : 'text-rose-500'
                    }`}
                  >
                    {r.type === 'income' ? '+' : r.type === 'expense' ? '-' : ''}
                    {formatCurrency(r.amount, true)}
                  </p>
                </div>

                <div className="border-border mt-2 flex items-center justify-between gap-2 border-t pt-2">
                  <p className="text-muted-foreground min-w-0 truncate text-[11px]">
                    {schedule}
                    {limit ? ` · ${limit}` : ''}
                  </p>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setRecurringPaused(r.id, !paused);
                        if (!paused) toast.success('Rule paused');
                        else {
                          const generated = processRecurring();
                          toast.success(
                            `Rule resumed${generated > 0 ? ` · added ${generated} due transaction${generated === 1 ? '' : 's'}` : ''}`,
                          );
                        }
                      }}
                      className="h-7 w-7"
                      aria-label={paused ? 'Resume rule' : 'Pause rule'}
                    >
                      {paused ? (
                        <Play size={13} className="text-emerald-500" />
                      ) : (
                        <Pause size={13} className="text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(r)}
                      className="h-7 w-7"
                      aria-label="Edit rule"
                    >
                      <Pencil size={13} className="text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Delete this recurring rule?',
                          description:
                            'Transactions it has already generated are kept — only future occurrences stop.',
                          confirmLabel: 'Delete rule',
                        });
                        if (confirmed) deleteRecurring(r.id);
                      }}
                      className="h-7 w-7"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Backfill preview — a past start date injects transactions and moves balances. */}
        <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
          <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add past transactions?</DialogTitle>
              <DialogDescription>
                {pending && (
                  <>
                    This rule started{' '}
                    {pending.preview.firstDate && format(pending.preview.firstDate, 'd MMM yyyy')},
                    so saving it will create{' '}
                    <strong className="text-foreground">
                      {pending.preview.count} transaction
                      {pending.preview.count === 1 ? '' : 's'}
                    </strong>{' '}
                    totalling{' '}
                    <strong className="text-foreground">
                      {formatCurrency(pending.preview.total)}
                    </strong>{' '}
                    and move your balances.
                    {pending.preview.capped &&
                      ' More will be added the next time the app opens — the catch-up is capped per run.'}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => pending && commit(pending.rule, pending.editingId, false)}
                className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white"
              >
                Add them
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => pending && commit(pending.rule, pending.editingId, true)}
                  className="bg-muted h-auto flex-1 rounded-lg py-2.5 text-sm font-medium"
                >
                  Start from today
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPending(null)}
                  className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2.5 text-sm font-medium"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  );
}
