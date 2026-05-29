import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { toLocalDateTimeInputValue } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TransactionType } from '@/types';

export default function AddTransaction() {
  const navigate = useNavigate();
  const { id } = useParams();
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const labels = useFinanceStore((s) => s.labels);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);

  const existing = id ? transactions.find((t) => t.id === id) : null;

  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [date, setDate] = useState(
    existing?.date ? toLocalDateTimeInputValue(existing.date) : toLocalDateTimeInputValue(new Date()),
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(existing?.labels ?? []);

  const filteredCategories = useMemo(() => {
    if (type === 'transfer') return categories.filter((c) => c.type === 'both');
    return categories.filter((c) => c.type === type || c.type === 'both');
  }, [categories, type]);

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
          : categoryId,
      date: new Date(date).toISOString(),
      note,
      labels: selectedLabels,
    };

    if (existing) {
      updateTransaction(existing.id, txData);
      toast.success('Transaction updated');
    } else {
      addTransaction(txData);
      toast.success('Transaction added');
    }
    navigate(-1);
  };

  const handleDelete = () => {
    if (existing && confirm('Delete this transaction?')) {
      deleteTransaction(existing.id);
      toast.success('Transaction deleted');
      navigate(-1);
    }
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((l) => l !== labelId) : [...prev, labelId],
    );
  };

  const typeAccent =
    type === 'expense' ? 'bg-grad-danger' : type === 'income' ? 'bg-grad-success' : 'bg-grad-info';

  return (
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border safe-top">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">
          {existing ? 'Edit Transaction' : 'Add Transaction'}
        </h1>
        {existing ? (
          <Button variant="ghost" size="icon" onClick={handleDelete} className="w-9 h-9 text-destructive rounded-full hover:bg-destructive/10">
            <Trash2 size={18} />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Type Selector */}
        <div className="grid grid-cols-3 gap-2 bg-muted p-1 rounded-2xl">
          {(['expense', 'income', 'transfer'] as const).map((t) => {
            const isActive = type === t;
            const grad = t === 'expense' ? 'bg-grad-danger' : t === 'income' ? 'bg-grad-success' : 'bg-grad-info';
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 rounded-xl text-sm font-medium capitalize transition-all ${
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
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Amount</Label>
          <div className={`relative rounded-2xl p-[1.5px] ${typeAccent}`}>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-auto w-full px-4 py-3 bg-card border-0 rounded-2xl text-2xl font-bold text-center"
            />
          </div>
        </div>

        {/* Account */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">
            {type === 'transfer' ? 'From Account' : 'Account'}
          </Label>
          <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
            <SelectTrigger className="w-full h-auto px-4 py-3 bg-card rounded-xl">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* To Account (Transfer) */}
        {type === 'transfer' && (
          <div>
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">To Account</Label>
            <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
              <SelectTrigger className="w-full h-auto px-4 py-3 bg-card rounded-xl">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.id !== accountId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Category */}
        {type !== 'transfer' && (
          <div>
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Category</Label>
            <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto scrollbar-hide">
              {filteredCategories.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all ${
                      selected
                        ? 'border-transparent ring-grad-primary'
                        : 'border-border bg-card hover:bg-muted'
                    }`}
                    style={selected ? { backgroundImage: `linear-gradient(135deg, ${cat.color}22, ${cat.color}11)` } : undefined}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundImage: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` }}
                    >
                      {cat.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] leading-tight line-clamp-2">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Date & Time</Label>
          <DateTimePicker value={date} onChange={setDate} />
        </div>

        {/* Note */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Note</Label>
          <Input
            type="text"
            placeholder="Add a note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-auto px-4 py-3 bg-card rounded-xl"
          />
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Labels</Label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
                const active = selectedLabels.includes(label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      active ? 'text-white shadow' : 'bg-muted text-muted-foreground'
                    }`}
                    style={
                      active
                        ? { backgroundImage: `linear-gradient(135deg, ${label.color}, ${label.color}cc)` }
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
          className="w-full h-auto py-3.5 bg-grad-primary text-white rounded-2xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-primary"
        >
          {existing ? 'Update Transaction' : 'Add Transaction'}
        </Button>
      </div>
    </div>
  );
}

