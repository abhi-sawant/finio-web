import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { useFinanceStore } from '@/store/useFinanceStore';
import { MISC_CATEGORY_ID } from '@/data/defaultData';
import {
  MATCH_TYPES,
  MATCH_TYPE_LABELS,
  isValidPattern,
  planRuleApplication,
} from '@/utils/autoCategorize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/use-confirm';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';
import type { CategoryRule, RuleMatchType, RuleScope } from '@/types';

const SCOPES: { value: RuleScope; label: string }[] = [
  { value: 'any', label: 'Expenses & income' },
  { value: 'expense', label: 'Expenses only' },
  { value: 'income', label: 'Income only' },
];

export default function CategoryRules() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rules = useFinanceStore((s) => s.rules);
  const categories = useFinanceStore((s) => s.categories);
  const labels = useFinanceStore((s) => s.labels);
  const transactions = useFinanceStore((s) => s.transactions);
  const addRule = useFinanceStore((s) => s.addRule);
  const updateRule = useFinanceStore((s) => s.updateRule);
  const deleteRule = useFinanceStore((s) => s.deleteRule);
  const moveRule = useFinanceStore((s) => s.moveRule);
  const applyRulesToExisting = useFinanceStore((s) => s.applyRulesToExisting);
  const restoreCategorization = useFinanceStore((s) => s.restoreCategorization);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<RuleMatchType>('contains');
  const [scope, setScope] = useState<RuleScope>('any');
  const [categoryId, setCategoryId] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [replayOpen, setReplayOpen] = useState(false);
  const [onlyUncategorized, setOnlyUncategorized] = useState(true);

  // A rule can file into an expense or income category, so the picker offers both.
  const selectableCategories = useMemo(
    () =>
      categories.filter((c) => (scope === 'any' ? true : c.type === scope || c.type === 'both')),
    [categories, scope],
  );

  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  /**
   * How many transactions the current rule set would move if replayed — recomputed live so the
   * replay dialog never promises a number it won't deliver.
   */
  const replayPlan = useMemo(
    () =>
      planRuleApplication(transactions, rules, {
        restrictToCategoryId: onlyUncategorized ? MISC_CATEGORY_ID : undefined,
      }),
    [transactions, rules, onlyUncategorized],
  );

  const patternValid = isValidPattern(pattern, matchType);

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setPattern('');
    setMatchType('contains');
    setScope('any');
    setCategoryId('');
    setLabelIds([]);
  };

  const handleEdit = (rule: CategoryRule) => {
    setEditId(rule.id);
    setPattern(rule.pattern);
    setMatchType(rule.matchType);
    setScope(rule.scope);
    setCategoryId(rule.categoryId);
    setLabelIds(rule.labelIds);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!patternValid) {
      toast.error(matchType === 'regex' ? 'That regex is not valid' : 'Enter something to match');
      return;
    }
    if (!categoryId) {
      toast.error('Pick a category to file matches into');
      return;
    }

    if (editId) {
      updateRule(editId, { pattern: pattern.trim(), matchType, scope, categoryId, labelIds });
    } else {
      addRule({ pattern: pattern.trim(), matchType, scope, categoryId, labelIds, enabled: true });
    }
    resetForm();
  };

  const handleDelete = async (rule: CategoryRule) => {
    const confirmed = await confirm({
      title: `Delete this rule?`,
      description: `New transactions whose note ${MATCH_TYPE_LABELS[rule.matchType]} "${rule.pattern}" will no longer be filed automatically. Transactions it has already categorized keep their category.`,
      confirmLabel: 'Delete rule',
    });
    if (confirmed) deleteRule(rule.id);
  };

  const handleReplay = () => {
    const { changed, previous } = applyRulesToExisting({
      restrictToCategoryId: onlyUncategorized ? MISC_CATEGORY_ID : undefined,
    });
    setReplayOpen(false);
    if (changed === 0) {
      toast('Nothing to recategorize');
      return;
    }
    toast.success(`Recategorized ${changed} transaction${changed === 1 ? '' : 's'}`, {
      action: { label: 'Undo', onClick: () => restoreCategorization(previous) },
    });
  };

  const toggleLabel = (id: string) => {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]));
  };

  return (
    <>
      <Header innerClassName="lg:max-w-xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Categorization Rules</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="text-primary h-9 w-9"
        >
          <Plus size={20} />
        </Button>
      </Header>

      <Main className="lg:max-w-xl">
        {rules.length === 0 ? (
          <div className="card-elevated space-y-2 rounded-2xl p-6 text-center">
            <Wand2 size={28} className="text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No rules yet</p>
            <p className="text-muted-foreground text-xs">
              A rule files a transaction automatically from its note — "contains Uber" → Transport.
              Rules run when you add a transaction and when you import a bank CSV.
            </p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground px-1 text-xs">
              Checked top to bottom — the first matching rule wins. Rules never touch transfers or
              split transactions.
            </p>

            <div className="space-y-2">
              {rules.map((rule, index) => {
                const category = categoryOf(rule.categoryId);
                const ruleLabels = rule.labelIds
                  .map((id) => labels.find((l) => l.id === id))
                  .filter((l) => l !== undefined);

                return (
                  <div
                    key={rule.id}
                    className={`card-elevated rounded-2xl p-3 ${rule.enabled ? '' : 'opacity-60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveRule(rule.id, 'up')}
                          disabled={index === 0}
                          aria-label="Move rule up"
                          className="text-muted-foreground disabled:opacity-25"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={() => moveRule(rule.id, 'down')}
                          disabled={index === rules.length - 1}
                          aria-label="Move rule down"
                          className="text-muted-foreground disabled:opacity-25"
                        >
                          <ChevronDown size={16} />
                        </button>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="text-muted-foreground">Note </span>
                          {MATCH_TYPE_LABELS[rule.matchType]}{' '}
                          <span className="font-semibold">"{rule.pattern}"</span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {category && (
                            <span
                              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                              style={{
                                backgroundImage: `linear-gradient(135deg, ${category.color}, ${category.color}cc)`,
                              }}
                            >
                              <CategoryIcon icon={category.icon} size={10} color="white" />
                              {category.name}
                            </span>
                          )}
                          {ruleLabels.map((label) => (
                            <span
                              key={label.id}
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                              style={{ backgroundColor: label.color }}
                            >
                              {label.name}
                            </span>
                          ))}
                          {rule.scope !== 'any' && (
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
                              {rule.scope === 'expense' ? 'Expenses' : 'Income'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Switch
                          size="sm"
                          checked={rule.enabled}
                          onCheckedChange={(enabled) => updateRule(rule.id, { enabled })}
                          aria-label={`Rule "${rule.pattern}" enabled`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(rule)}
                          className="h-8 w-8"
                        >
                          <Pencil size={14} className="text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(rule)}
                          className="h-8 w-8"
                        >
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => setReplayOpen(true)}
              variant="secondary"
              className="bg-muted h-auto w-full rounded-2xl py-3 text-sm font-medium"
            >
              <Wand2 size={15} className="mr-1.5" /> Apply to Existing Transactions
            </Button>
          </>
        )}

        {/* Add / edit rule */}
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!v) resetForm();
          }}
        >
          <DialogContent className="bg-card mx-auto max-h-[80vh] w-11/12 overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit Rule' : 'New Rule'}</DialogTitle>
              <DialogDescription>
                When a transaction's note matches, file it into a category and tag it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                    Note
                  </Label>
                  <Select
                    value={matchType}
                    onValueChange={(v) => setMatchType((v as RuleMatchType) ?? matchType)}
                  >
                    <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2 text-sm">
                      <SelectValue>{MATCH_TYPE_LABELS[matchType]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                    Applies to
                  </Label>
                  <Select value={scope} onValueChange={(v) => setScope((v as RuleScope) ?? scope)}>
                    <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2 text-sm">
                      <SelectValue>{SCOPES.find((s) => s.value === scope)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Input
                  type="text"
                  placeholder={matchType === 'regex' ? 'e\\.g\\. uber|ola' : 'e.g. Uber'}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="bg-muted h-auto rounded-lg px-3 py-2"
                />
                {matchType === 'regex' && pattern.trim() !== '' && !patternValid && (
                  <p className="mt-1 text-xs text-rose-500">Not a valid regular expression</p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  Matching ignores case.
                  {matchType === 'regex' && ' Regex runs against the whole note.'}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  File into
                </Label>
                <div className="scrollbar-hide grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
                  {selectableCategories.map((cat) => {
                    const selected = categoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryId(cat.id)}
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
                          className="flex h-7 w-7 items-center justify-center rounded-full"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`,
                          }}
                        >
                          <CategoryIcon icon={cat.icon} size={14} color="white" />
                        </div>
                        <span className="line-clamp-2 text-[10px] leading-tight">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {labels.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                    Also tag with (optional)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {labels.map((label) => {
                      const active = labelIds.includes(label.id);
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

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
                >
                  {editId ? 'Update Rule' : 'Add Rule'}
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
          </DialogContent>
        </Dialog>

        {/* Replay over existing history */}
        <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
          <DialogContent className="bg-card top-1/4 mx-auto w-11/12 rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Apply Rules to Existing Transactions</DialogTitle>
              <DialogDescription>
                Runs every enabled rule over transactions already in your ledger. Transfers and
                split transactions are left alone, and you can undo the whole pass.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1">
                {[
                  { value: true, label: 'Uncategorized only' },
                  { value: false, label: 'All transactions' },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    onClick={() => setOnlyUncategorized(option.value)}
                    className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                      onlyUncategorized === option.value
                        ? 'bg-grad-primary text-white shadow'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {onlyUncategorized
                  ? 'Only touches transactions currently filed under Miscellaneous — the usual state after a bank import.'
                  : 'Re-files every matching transaction, including ones you categorized by hand.'}
              </p>

              <p className="text-sm">
                <span className="text-lg font-bold">{replayPlan.length}</span> transaction
                {replayPlan.length === 1 ? '' : 's'} would change.
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={handleReplay}
                  disabled={replayPlan.length === 0}
                  className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setReplayOpen(false)}
                  className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
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
