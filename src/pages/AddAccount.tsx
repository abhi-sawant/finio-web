import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Trash2,
  Landmark,
  PiggyBank,
  Banknote,
  CreditCard,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import type { AccountType, Currency } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const TYPE_ICONS: Record<string, LucideIcon> = {
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  banknote: Banknote,
  'credit-card': CreditCard,
  'trending-up': TrendingUp,
  wallet: Wallet,
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
  '#6C63FF',
  '#ef4444',
  '#f97316',
  '#fb923c',
  '#f59e0b',
  '#fbbf24',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#34d399',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#60a5fa',
  '#3b82f6',
  '#8b5cf6',
  '#a78bfa',
  '#d946ef',
  '#ec4899',
  '#f472b6',
  '#64748b',
  '#94a3b8',
  '#78716c',
  '#6b7280',
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
  const [balance, setBalance] = useState(
    existing?.type === 'credit' ? '0' : (existing?.balance?.toString() ?? '0'),
  );
  const [due, setDue] = useState(
    existing?.type === 'credit' ? Math.abs(existing.balance).toString() : '0',
  );
  const [color, setColor] = useState(existing?.color ?? accountColors[0]);
  const [currency] = useState<Currency>(existing?.currency ?? settings.currency);
  const [creditLimit, setCreditLimit] = useState(existing?.creditLimit?.toString() ?? '0');

  const handleSubmit = () => {
    if (!name.trim()) return;

    const data = {
      name: name.trim(),
      type,
      balance: type === 'credit' ? -(parseFloat(due) || 0) : parseFloat(balance) || 0,
      color,
      icon: existing?.icon ?? accountTypes.find((t) => t.value === type)?.icon ?? 'landmark',
      currency,
      creditLimit: type === 'credit' ? parseFloat(creditLimit) || undefined : undefined,
    };

    if (existing) {
      updateAccount(existing.id, data);
    } else {
      addAccount(data);
    }
    navigate(-1);
  };

  const handleDelete = () => {
    if (
      existing &&
      confirm(`Delete "${existing.name}"? All associated transactions will be deleted.`)
    ) {
      deleteAccount(existing.id);
      navigate(-1);
    }
  };

  return (
    <>
      {/* Header */}
      <Header>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">{existing ? 'Edit Account' : 'Add Account'}</h1>
        {existing ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="text-destructive h-9 w-9"
          >
            <Trash2 size={18} />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </Header>

      <Main>
        {/* Name */}
        <div>
          <Label
            htmlFor="accountName"
            className="text-muted-foreground mb-1.5 block text-xs font-medium"
          >
            Account Name
          </Label>
          <Input
            id="accountName"
            type="text"
            placeholder="e.g., HDFC Savings"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-card h-auto rounded-xl px-4 py-3"
          />
        </div>

        {/* Type */}
        <div>
          <Label
            htmlFor="accountType"
            className="text-muted-foreground mb-1.5 block text-xs font-medium"
          >
            Account Type
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {accountTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  type === t.value ? 'border-primary bg-primary/10' : 'border-border bg-card'
                }`}
              >
                {(() => {
                  const Icon = TYPE_ICONS[t.icon];
                  return Icon ? (
                    <Icon size={20} className="mx-auto mb-1" />
                  ) : (
                    <span className="mb-1 block text-lg">{t.icon}</span>
                  );
                })()}
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Balance / Due */}
        {type === 'credit' ? (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Current Due
            </Label>
            <NumberPad value={due} onChange={setDue} />
          </div>
        ) : (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Current Balance
            </Label>
            <NumberPad value={balance} onChange={setBalance} />
          </div>
        )}

        {/* Credit Limit */}
        {type === 'credit' && (
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Credit Limit
            </Label>
            <NumberPad value={creditLimit} onChange={setCreditLimit} />
          </div>
        )}

        {/* Color */}
        <div>
          <Label
            htmlFor="accountColor"
            className="text-muted-foreground mb-1.5 block text-xs font-medium"
          >
            Color
          </Label>
          <div className="flex flex-wrap gap-4">
            {accountColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition-transform ${
                  color === c ? 'ring-primary scale-110 ring-1 ring-offset-1' : ''
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
          className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-xl py-3.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {existing ? 'Update Account' : 'Add Account'}
        </Button>
      </Main>
    </>
  );
}
