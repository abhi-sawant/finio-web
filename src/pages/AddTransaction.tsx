import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
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
import Main from '@/components/ui/main';
import Header from '@/components/ui/header';

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
    existing?.date
      ? toLocalDateTimeInputValue(existing.date)
      : toLocalDateTimeInputValue(new Date()),
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
      categoryId: type === 'transfer' ? (transferCategory?.id ?? categoryId ?? '') : categoryId,
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

      <Main>
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
                onClick={() => setType(t)}
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
          <div className={`relative rounded-2xl p-[1.5px] ${typeAccent}`}>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-card h-auto w-full rounded-2xl border-0 px-4 py-3 text-center text-2xl font-bold"
            />
          </div>
        </div>

        {/* Account */}
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            {type === 'transfer' ? 'From Account' : 'Account'}
          </Label>
          <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
            <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
              <SelectValue placeholder="Select account">
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

        {/* To Account (Transfer) */}
        {type === 'transfer' && (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              To Account
            </Label>
            <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
              <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
                <SelectValue placeholder="Select account" />
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
        )}

        {/* Category */}
        {type !== 'transfer' && (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Category
            </Label>
            <div className="scrollbar-hide grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">
              {filteredCategories.map((cat) => {
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
            onChange={(e) => setNote(e.target.value)}
            className="bg-card h-auto rounded-xl px-4 py-3"
          />
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
