import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Trash2, Split, Plus, X, Wand2 } from 'lucide-react';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { roundMoney } from '@/store/balance';
import { findMatchingRule, mergeLabels } from '@/utils/autoCategorize';
import { parseSharePayload } from '@/utils/shareTarget';
import { formatCurrency, toLocalDateTimeInputValue } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CategoryRule, TransactionType } from '@/types';
import Main from '@/components/ui/main';
import Header from '@/components/ui/header';

export default function AddTransaction() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const labels = useFinanceStore((s) => s.labels);
  const rules = useFinanceStore((s) => s.rules);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const restoreTransaction = useFinanceStore((s) => s.restoreTransaction);

  const existing = id ? transactions.find((t) => t.id === id) : null;

  /**
   * A draft handed to us by the OS: the Web Share Target (`/share-target?title=&text=&url=`) or
   * a manifest shortcut (`/add-transaction?type=expense`). Only ever consumed by the `useState`
   * initializers below, so it seeds a blank form and can never overwrite something typed.
   * `existing` is always null on both of those routes, but the guard makes that explicit.
   */
  const shared = useMemo(
    () =>
      existing
        ? null
        : parseSharePayload({
            title: searchParams.get('title'),
            text: searchParams.get('text'),
            url: searchParams.get('url'),
            type: searchParams.get('type'),
          }),
    [existing, searchParams],
  );

  /**
   * Auto-categorize the shared note up front rather than in a mount effect: `setNote` alone
   * does not run rules (that lives in `applyRulesToNote`, which can't be called during render),
   * and seeding `appliedRule` below means the existing "filed by your rule / Undo" banner shows
   * up — so a shared transaction gets the same visible, reversible treatment as a typed one.
   */
  const sharedRule = useMemo(
    () => (shared?.note ? findMatchingRule(rules, shared.note, shared.type) : undefined),
    [rules, shared],
  );

  const [type, setType] = useState<TransactionType>(existing?.type ?? shared?.type ?? 'expense');
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? shared?.amount ?? '');
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? accounts.find((a) => !a.archivedAt)?.id ?? '',
  );
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? sharedRule?.categoryId ?? '',
  );
  const [date, setDate] = useState(
    existing?.date
      ? toLocalDateTimeInputValue(existing.date)
      : toLocalDateTimeInputValue(new Date()),
  );
  const [note, setNote] = useState(existing?.note ?? shared?.note ?? '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    existing?.labels ?? mergeLabels([], sharedRule?.labelIds ?? []),
  );

  const [splitMode, setSplitMode] = useState(!!existing?.splits?.length);
  const [splitRows, setSplitRows] = useState<{ categoryId: string; amount: string }[]>(
    existing?.splits?.length
      ? existing.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount.toString() }))
      : [
          { categoryId: '', amount: '' },
          { categoryId: '', amount: '' },
        ],
  );

  /**
   * Auto-categorization only ever fills a blank the user hasn't filled themselves. Once they
   * touch the category picker (or dismiss a suggestion) rules stop firing for this form, and
   * editing an existing transaction never triggers them at all — a saved category is a decision.
   */
  const categoryTouched = useRef(false);
  const [appliedRule, setAppliedRule] = useState<{
    rule: CategoryRule;
    prevCategoryId: string;
    prevLabels: string[];
  } | null>(
    // A rule seeded from a shared note starts from a blank baseline, so editing the note backs
    // it out to an empty category exactly as if the user had typed the note themselves.
    sharedRule ? { rule: sharedRule, prevCategoryId: '', prevLabels: [] } : null,
  );

  /**
   * A cold start from a manifest shortcut, a share or a notification has nothing behind it in
   * the history stack, and `navigate(-1)` there drops the user straight out of the PWA. React
   * Router stamps `history.state.idx`, and 0 means this is the first entry.
   */
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);

  const applyRulesToNote = (value: string, txType: TransactionType, splitting: boolean) => {
    if (existing || categoryTouched.current || (txType === 'expense' && splitting)) return;

    const rule = findMatchingRule(rules, value, txType);
    if (rule && appliedRule?.rule.id === rule.id) return;

    // Baseline is whatever the user had before *any* rule touched the form, so re-matching a
    // different rule (or matching nothing) never compounds an earlier rule's edits.
    const baseCategoryId = appliedRule ? appliedRule.prevCategoryId : categoryId;
    const baseLabels = appliedRule ? appliedRule.prevLabels : selectedLabels;

    if (!rule) {
      // The note no longer matches — back out, rather than leaving behind a category the
      // user never chose.
      if (!appliedRule) return;
      setCategoryId(baseCategoryId);
      setSelectedLabels(baseLabels);
      setAppliedRule(null);
      return;
    }

    setCategoryId(rule.categoryId);
    setSelectedLabels(mergeLabels(baseLabels, rule.labelIds));
    setAppliedRule({ rule, prevCategoryId: baseCategoryId, prevLabels: baseLabels });
  };

  const handleNoteChange = (value: string) => {
    setNote(value);
    applyRulesToNote(value, type, splitMode);
  };

  const handleTypeChange = (next: TransactionType) => {
    setType(next);
    // A rule is scoped to expense or income, so switching type can change which one wins.
    applyRulesToNote(note, next, splitMode);
  };

  const dismissAppliedRule = () => {
    if (!appliedRule) return;
    setCategoryId(appliedRule.prevCategoryId);
    setSelectedLabels(appliedRule.prevLabels);
    setAppliedRule(null);
    categoryTouched.current = true;
  };

  const chooseCategory = (id: string) => {
    categoryTouched.current = true;
    setAppliedRule(null);
    setCategoryId(id);
  };

  const notesSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return transactions
      .map((t) => t.note?.trim())
      .filter((n): n is string => !!n && !seen.has(n) && seen.add(n) !== undefined);
  }, [transactions]);

  // Archived accounts are hidden from the picker, but an existing transaction may already sit
  // on one — keep that account selectable so editing the row cannot silently reassign it.
  const selectableAccounts = useMemo(() => {
    const inUse = new Set([existing?.accountId, existing?.toAccountId].filter(Boolean));
    return accounts.filter((a) => !a.archivedAt || inUse.has(a.id));
  }, [accounts, existing?.accountId, existing?.toAccountId]);

  const filteredCategories = useMemo(() => {
    if (type === 'transfer') return categories.filter((c) => c.type === 'both');
    return categories.filter((c) => c.type === type || c.type === 'both');
  }, [categories, type]);

  const useSplits = type === 'expense' && splitMode;
  const splitTotal = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const splitRemaining = roundMoney((parseFloat(amount) || 0) - splitTotal);

  const updateSplitRow = (idx: number, patch: Partial<{ categoryId: string; amount: string }>) => {
    setSplitRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleAddSplitRow = () => {
    setSplitRows((prev) => [...prev, { categoryId: '', amount: '' }]);
  };

  const handleRemoveSplitRow = (idx: number) => {
    if (splitRows.length <= 2) {
      // Down to one row is just an unsplit category — fold back to the plain picker.
      const keep = splitRows[idx === 0 ? 1 : 0];
      setCategoryId(keep?.categoryId ?? '');
      setSplitRows([
        { categoryId: '', amount: '' },
        { categoryId: '', amount: '' },
      ]);
      setSplitMode(false);
      return;
    }
    setSplitRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleSplitMode = () => {
    // Either direction is the user taking charge of the category — a rule has no business
    // flattening a split, or re-firing once they fold one back down.
    categoryTouched.current = true;
    setAppliedRule(null);
    if (splitMode) {
      const first = splitRows.find((r) => r.categoryId);
      if (first) setCategoryId(first.categoryId);
      setSplitMode(false);
    } else {
      setSplitRows((prev) =>
        prev.some((r) => r.categoryId || r.amount)
          ? prev
          : [
              { categoryId, amount: '' },
              { categoryId: '', amount: '' },
            ],
      );
      setSplitMode(true);
    }
  };

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!accountId) {
      toast.error('Select an account');
      return;
    }
    if (type === 'transfer') {
      if (!toAccountId) {
        toast.error('Select a destination account');
        return;
      }
      if (toAccountId === accountId) {
        toast.error('Source and destination must differ');
        return;
      }
    } else if (useSplits) {
      if (splitRows.some((r) => !r.categoryId || !r.amount.trim() || parseFloat(r.amount) <= 0)) {
        toast.error('Fill in every split row');
        return;
      }
      if (Math.abs(splitRemaining) > 0.01) {
        toast.error(
          splitRemaining > 0
            ? `${formatCurrency(splitRemaining)} left to allocate`
            : `${formatCurrency(-splitRemaining)} over the total`,
        );
        return;
      }
    } else if (!categoryId) {
      toast.error('Select a category');
      return;
    }

    const transferCategory = categories.find((c) => c.type === 'both');
    const txData = {
      type,
      amount: parsedAmount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId:
        type === 'transfer'
          ? (transferCategory?.id ?? categoryId ?? '')
          : useSplits
            ? ''
            : categoryId,
      date: new Date(date).toISOString(),
      note,
      labels: selectedLabels,
      splits: useSplits
        ? splitRows.map((r) => ({
            categoryId: r.categoryId,
            amount: roundMoney(parseFloat(r.amount)),
          }))
        : undefined,
    };

    if (existing) {
      updateTransaction(existing.id, txData);
      toast.success('Transaction updated');
    } else {
      addTransaction(txData);
      toast.success('Transaction added');
    }
    goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    // Cheap and fully reversible, so undo beats a confirm prompt here.
    const removed = deleteTransaction(existing.id);
    if (!removed) return;
    goBack();
    toast.success('Transaction deleted', {
      action: { label: 'Undo', onClick: () => restoreTransaction(removed) },
    });
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((l) => l !== labelId) : [...prev, labelId],
    );
  };

  return (
    <>
      {/* Header */}
      <Header innerClassName="lg:max-w-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          className="h-9 w-9 rounded-full"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">
          {existing ? 'Edit Transaction' : 'Add Transaction'}
        </h1>
        {existing ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="text-destructive hover:bg-destructive/10 h-9 w-9 rounded-full"
          >
            <Trash2 size={18} />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </Header>

      <Main className="lg:max-w-xl">
        {/* Type Selector */}
        <div className="bg-muted grid grid-cols-3 gap-2 rounded-2xl p-1">
          {(['expense', 'income', 'transfer'] as const).map((t) => {
            const isActive = type === t;
            const grad =
              t === 'expense'
                ? 'bg-grad-danger'
                : t === 'income'
                  ? 'bg-grad-success'
                  : 'bg-grad-info';
            return (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={`rounded-xl py-2 text-sm font-medium capitalize transition-all ${
                  isActive ? `${grad} text-white shadow` : 'text-muted-foreground'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Amount */}
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Amount</Label>
          <NumberPad value={amount} onChange={setAmount} />
        </div>

        {/* Account */}
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            {type === 'transfer' ? 'From Account' : 'Account'}
          </Label>
          <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
            <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
              <SelectValue placeholder="Select account">
                {accounts.find((a) => a.id === accountId) && (
                  <span>
                    {accounts.find((a) => a.id === accountId)?.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      [
                      {accounts
                        .find((a) => a.id === accountId)
                        ?.type?.charAt(0)
                        .toUpperCase()}
                      {accounts.find((a) => a.id === accountId)?.type?.slice(1)}]
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {selectableAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-1">
                    {a.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      [{a.type?.charAt(0).toUpperCase()}
                      {a.type?.slice(1)}]
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* To Account (Transfer) */}
        {type === 'transfer' && (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              To Account
            </Label>
            <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
              <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
                <SelectValue placeholder="Select account">
                  {accounts.find((a) => a.id === toAccountId) && (
                    <span>
                      {accounts.find((a) => a.id === toAccountId)?.name}{' '}
                      <span className="text-muted-foreground text-xs">
                        [
                        {accounts
                          .find((a) => a.id === toAccountId)
                          ?.type?.charAt(0)
                          .toUpperCase()}
                        {accounts.find((a) => a.id === toAccountId)?.type?.slice(1)}]
                      </span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selectableAccounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-1">
                        {a.name}{' '}
                        <span className="text-muted-foreground text-xs">
                          [{a.type?.charAt(0).toUpperCase()}
                          {a.type?.slice(1)}]
                        </span>
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Category */}
        {type !== 'transfer' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-muted-foreground block text-xs font-medium">Category</Label>
              {type === 'expense' && (
                <button
                  type="button"
                  onClick={toggleSplitMode}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                    splitMode ? 'bg-grad-primary text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Split size={12} /> Split
                </button>
              )}
            </div>

            {splitMode ? (
              <div className="space-y-2">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={row.categoryId}
                      onValueChange={(v) => updateSplitRow(idx, { categoryId: v ?? '' })}
                    >
                      <SelectTrigger className="bg-card h-auto min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm">
                        <SelectValue placeholder="Category">
                          {filteredCategories.find((c) => c.id === row.categoryId)?.name}
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
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Amount"
                      value={row.amount}
                      onChange={(e) => updateSplitRow(idx, { amount: e.target.value })}
                      className="bg-card h-auto w-24 shrink-0 rounded-xl px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSplitRow(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                      aria-label="Remove split"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddSplitRow}
                  className="text-primary flex items-center gap-1 text-xs font-medium"
                >
                  <Plus size={14} /> Add split
                </button>
                <p
                  className={`text-xs ${
                    Math.abs(splitRemaining) < 0.01 ? 'text-muted-foreground' : 'text-rose-500'
                  }`}
                >
                  {Math.abs(splitRemaining) < 0.01
                    ? 'Fully allocated'
                    : splitRemaining > 0
                      ? `${formatCurrency(splitRemaining)} left to allocate`
                      : `${formatCurrency(-splitRemaining)} over the total`}
                </p>
              </div>
            ) : (
              <div className="scrollbar-hide grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">
                {filteredCategories.map((cat) => {
                  const selected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => chooseCategory(cat.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-all ${
                        selected
                          ? 'ring-grad-primary border-transparent'
                          : 'border-border bg-card hover:bg-muted'
                      }`}
                      style={
                        selected
                          ? {
                              backgroundImage: `linear-gradient(135deg, ${cat.color}22, ${cat.color}11)`,
                            }
                          : undefined
                      }
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`,
                        }}
                      >
                        <CategoryIcon icon={cat.icon} size={16} color="white" />
                      </div>
                      <span className="line-clamp-2 text-[10px] leading-tight">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Date & Time
          </Label>
          <DateTimePicker value={date} onChange={setDate} />
        </div>

        {/* Note */}
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Note</Label>
          <Input
            type="text"
            placeholder="Add a note..."
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            className="bg-card h-auto rounded-xl px-4 py-3"
            list="note-suggestions"
          />
          <datalist id="note-suggestions">
            {notesSuggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {appliedRule && (
            <div className="text-primary mt-1.5 flex items-center gap-1.5 text-xs">
              <Wand2 size={12} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Filed as {categories.find((c) => c.id === appliedRule.rule.categoryId)?.name} by
                your "{appliedRule.rule.pattern}" rule
              </span>
              <button
                type="button"
                onClick={dismissAppliedRule}
                className="text-muted-foreground shrink-0 underline"
              >
                Undo
              </button>
            </div>
          )}
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Labels</Label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
                const active = selectedLabels.includes(label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      active ? 'text-white shadow' : 'bg-muted text-muted-foreground'
                    }`}
                    style={
                      active
                        ? {
                            backgroundImage: `linear-gradient(135deg, ${label.color}, ${label.color}cc)`,
                          }
                        : undefined
                    }
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!amount || !accountId}
          className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {existing ? 'Update Transaction' : 'Add Transaction'}
        </Button>
      </Main>
    </>
  );
}
