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
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border safe-top">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Recurring</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowForm((v) => !v)}
          disabled={accounts.length === 0}
          className="w-9 h-9 text-primary rounded-full hover:bg-primary/10 disabled:opacity-30"
          aria-label="Add recurring"
        >
          <Plus size={20} />
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Add an account first to create recurring rules.
          </p>
        )}

        {showForm && (
          <div className="rounded-2xl p-4 card-elevated space-y-3">
            <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-xl">
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setCategoryId(''); }}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-all ${
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
              className="h-auto px-3 py-2 bg-muted rounded-lg"
            />
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger className="w-full h-auto px-3 py-2 bg-muted rounded-lg">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
              <SelectTrigger className="w-full h-auto px-3 py-2 bg-muted rounded-lg">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Note (e.g., Netflix)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-auto px-3 py-2 bg-muted rounded-lg"
            />
            <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger className="w-full h-auto px-3 py-2 bg-muted rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQ_LABEL) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>
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
                className="flex-1 h-auto py-2 bg-grad-primary text-white rounded-lg text-sm font-medium shadow-glow-primary"
              >
                Save Rule
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowForm(false)}
                className="h-auto px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {recurring.length === 0 && !showForm && accounts.length > 0 && (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-grad-info flex items-center justify-center mx-auto mb-3">
              <Repeat size={22} className="text-white" />
            </div>
            <p className="text-muted-foreground mb-4">No recurring rules yet</p>
            <Button
              onClick={() => setShowForm(true)}
              className="h-auto bg-grad-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-glow-primary"
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
              <div key={r.id} className="rounded-2xl p-3 card-elevated flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                >
                  <Repeat size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.note || cat?.name || 'Recurring'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {FREQ_LABEL[r.frequency]} · {acc?.name ?? 'Unknown'}{' '}
                    {r.lastRunDate ? `· last ${formatFullDate(r.lastRunDate)}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${r.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
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
                  className="w-7 h-7"
                  aria-label="Delete"
                >
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
