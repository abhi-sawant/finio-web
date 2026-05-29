import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, Trash2,
  Landmark, PiggyBank, Banknote, CreditCard, TrendingUp, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AccountType, Currency } from '@/types';

const TYPE_ICONS: Record<string, LucideIcon> = {
  'landmark': Landmark,
  'piggy-bank': PiggyBank,
  'banknote': Banknote,
  'credit-card': CreditCard,
  'trending-up': TrendingUp,
  'wallet': Wallet,
};

const accountTypes: { value: AccountType; label: string; icon: string }[] = [
  { value: 'checking', label: 'Checking', icon: 'landmark' },
  { value: 'savings', label: 'Savings', icon: 'piggy-bank' },
  { value: 'cash', label: 'Cash', icon: 'banknote' },
  { value: 'credit', label: 'Credit Card', icon: 'credit-card' },
  { value: 'investment', label: 'Investment', icon: 'trending-up' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

const accountColors = [
  '#6C63FF', '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export default function AddAccount() {
  const navigate = useNavigate();
  const { id } = useParams();
  const accounts = useFinanceStore((s) => s.accounts);
  const settings = useFinanceStore((s) => s.settings);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);

  const existing = id ? accounts.find((a) => a.id === id) : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'checking');
  const [balance, setBalance] = useState(existing?.balance?.toString() ?? '0');
  const [color, setColor] = useState(existing?.color ?? accountColors[0]);
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? settings.currency);
  const [creditLimit, setCreditLimit] = useState(existing?.creditLimit?.toString() ?? '');

  const handleSubmit = () => {
    if (!name.trim()) return;

    const data = {
      name: name.trim(),
      type,
      balance: parseFloat(balance) || 0,
      color,
      icon: existing?.icon ?? accountTypes.find((t) => t.value === type)?.icon ?? 'landmark',
      currency,
      creditLimit: type === 'credit' ? (parseFloat(creditLimit) || undefined) : undefined,
    };

    if (existing) {
      updateAccount(existing.id, data);
    } else {
      addAccount(data);
    }
    navigate(-1);
  };

  const handleDelete = () => {
    if (existing && confirm(`Delete "${existing.name}"? All associated transactions will be deleted.`)) {
      deleteAccount(existing.id);
      navigate(-1);
    }
  };

  return (
    <div className="min-h-dvh bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-9 h-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">
          {existing ? 'Edit Account' : 'Add Account'}
        </h1>
        {existing ? (
          <Button variant="ghost" size="icon" onClick={handleDelete} className="w-9 h-9 text-destructive">
            <Trash2 size={18} />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Name */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Account Name</Label>
          <Input
            type="text"
            placeholder="e.g., HDFC Savings"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-auto px-4 py-3 bg-card rounded-xl"
          />
        </div>

        {/* Type */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Account Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {accountTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`p-3 rounded-xl border text-center transition-colors ${
                  type === t.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card'
                }`}
              >
                {(() => { const Icon = TYPE_ICONS[t.icon]; return Icon ? <Icon size={20} className="mx-auto mb-1" /> : <span className="text-lg block mb-1">{t.icon}</span>; })()}
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Balance */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">
            {type === 'credit' ? 'Current Balance (negative = owed)' : 'Current Balance'}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="h-auto px-4 py-3 bg-card rounded-xl"
          />
        </div>

        {/* Credit Limit */}
        {type === 'credit' && (
          <div>
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Credit Limit</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="e.g., 100000"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              className="h-auto px-4 py-3 bg-card rounded-xl"
            />
          </div>
        )}

        {/* Color */}
        <div>
          <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Color</Label>
          <div className="flex gap-2 flex-wrap">
            {accountColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-transform ${
                  color === c ? 'scale-125 ring-2 ring-offset-2 ring-primary' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full h-auto py-3.5 bg-grad-primary text-white shadow-glow-primary rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {existing ? 'Update Account' : 'Add Account'}
        </Button>
      </div>
    </div>
  );
}
