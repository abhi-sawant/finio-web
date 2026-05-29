import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatFullDate, toLocalDateTimeInputValue } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RecurrenceFrequency } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const FREQ_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export default function Recurring() {
  const navigate = useNavigate();
  const recurring = useFinanceStore((s) => s.recurring);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const currency = useFinanceStore((s) => s.settings.currency);
  const addRecurring = useFinanceStore((s) => s.addRecurring);
  const deleteRecurring = useFinanceStore((s) => s.deleteRecurring);
  const processRecurring = useFinanceStore((s) => s.processRecurring);

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [startDate, setStartDate] = useState(toLocalDateTimeInputValue(new Date()));

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === type || c.type === 'both'),
    [categories, type],
  );

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return toast.error('Enter a valid amount');
    if (!accountId) return toast.error('Select an account');
    if (!categoryId) return toast.error('Select a category');

    addRecurring({
      type,
      amount: parsed,
      accountId,
      categoryId,
      note,
      labels: [],
      frequency,
      startDate: new Date(startDate).toISOString(),
    });
    // Immediately run any past-due occurrences
    const generated = processRecurring();
    toast.success(
      `Recurring rule created${generated > 0 ? ` · added ${generated} past-due transaction${generated === 1 ? '' : 's'}` : ''}`,
    );
    setShowForm(false);
    setAmount('');
    setNote('');
    setCategoryId('');
    setFrequency('monthly');
    setStartDate(toLocalDateTimeInputValue(new Date()));
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
        <h1 className="text-base font-semibold">Recurring</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowForm((v) => !v)}
          disabled={accounts.length === 0}
          className="text-primary hover:bg-primary/10 h-9 w-9 rounded-full disabled:opacity-30"
          aria-label="Add recurring"
        >
          <Plus size={20} />
        </Button>
      </Header>

      <Main>
        {accounts.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Add an account first to create recurring rules.
          </p>
        )}

        {showForm && (
          <div className="card-elevated space-y-3 rounded-2xl p-4">
            <div className="bg-muted grid grid-cols-2 gap-2 rounded-xl p-1">
              {(['expense', 'income'] as const).map((t) => (
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
                        : 'bg-grad-success text-white shadow'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-muted h-auto rounded-lg px-3 py-2"
            />
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
            <DateTimePicker
              value={startDate}
              onChange={setStartDate}
              inputClassName="h-auto px-3 py-2 bg-muted rounded-lg"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                Save Rule
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowForm(false)}
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
              onClick={() => setShowForm(true)}
              className="bg-grad-primary shadow-glow-primary h-auto rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Create a rule
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {recurring.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const acc = accounts.find((a) => a.id === r.accountId);
            const color = cat?.color ?? '#94a3b8';
            return (
              <div key={r.id} className="card-elevated flex items-center gap-3 rounded-2xl p-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white"
                  style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                >
                  <Repeat size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.note || cat?.name || 'Recurring'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {FREQ_LABEL[r.frequency]} · {acc?.name ?? 'Unknown'}{' '}
                    {r.lastRunDate ? `· last ${formatFullDate(r.lastRunDate)}` : ''}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold ${r.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {r.type === 'income' ? '+' : '-'}
                  {formatCurrency(r.amount, currency, true)}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm('Delete this recurring rule? Past transactions will be kept.')) {
                      deleteRecurring(r.id);
                    }
                  }}
                  className="h-7 w-7"
                  aria-label="Delete"
                >
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </Main>
    </>
  );
}
