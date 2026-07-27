import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import type { AccountType } from '@/types';

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string; Icon: LucideIcon }[] = [
  { value: 'checking', label: 'Checking', icon: 'landmark', Icon: Landmark },
  { value: 'savings', label: 'Savings', icon: 'piggy-bank', Icon: PiggyBank },
  { value: 'cash', label: 'Cash', icon: 'banknote', Icon: Banknote },
  { value: 'credit', label: 'Credit Card', icon: 'credit-card', Icon: CreditCard },
  { value: 'investment', label: 'Investment', icon: 'trending-up', Icon: TrendingUp },
  { value: 'wallet', label: 'Wallet', icon: 'wallet', Icon: Wallet },
];

const COLORS = ['#6C63FF', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

type Step = 'name' | 'account' | 'balance';

const STEPS: Step[] = ['name', 'account', 'balance'];

/**
 * First-run wizard: name → first account → opening balance.
 *
 * Rendered instead of the app when `settings.onboardedAt` is unset. Every step past the name
 * is skippable so someone reinstalling can get straight to Settings and restore a backup
 * rather than being forced to invent an account first.
 */
export function Onboarding() {
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateSettings = useFinanceStore((s) => s.updateSettings);

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('savings');
  const [color, setColor] = useState(COLORS[0]);
  const [balance, setBalance] = useState('');

  const trimmedName = name.trim();
  const trimmedAccountName = accountName.trim();
  const stepIndex = STEPS.indexOf(step);

  const finish = (withAccount: boolean) => {
    if (withAccount && trimmedAccountName) {
      const parsed = parseFloat(balance);
      const opening = Number.isFinite(parsed) ? parsed : 0;
      addAccount({
        name: trimmedAccountName,
        type: accountType,
        color,
        icon: ACCOUNT_TYPES.find((t) => t.value === accountType)?.icon ?? 'landmark',
        // A credit card's "balance" is money owed, so it starts negative.
        balance: accountType === 'credit' ? -Math.abs(opening) : opening,
      });
    }
    updateSettings({ userName: trimmedName || 'there', onboardedAt: new Date().toISOString() });
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Progress */}
        <div className="flex gap-1.5" role="presentation">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? 'bg-grad-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {step === 'name' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">Welcome to Finio</h1>
              <p className="text-muted-foreground text-sm">
                Everything stays on this device. Let&rsquo;s start with your name.
              </p>
            </div>
            <div>
              <Label htmlFor="onboarding-name" className="mb-1.5 block text-xs font-medium">
                What should we call you?
              </Label>
              <Input
                id="onboarding-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && trimmedName) setStep('account');
                }}
                placeholder="Your name"
                className="bg-card h-auto w-full rounded-xl px-4 py-3"
              />
            </div>
            <Button
              size="lg"
              className="bg-grad-primary shadow-glow-primary w-full text-white"
              disabled={!trimmedName}
              onClick={() => setStep('account')}
            >
              Continue <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {step === 'account' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">Add your first account</h1>
              <p className="text-muted-foreground text-sm">
                A bank account, a card, or just the cash in your wallet.
              </p>
            </div>

            <div>
              <Label htmlFor="onboarding-account" className="mb-1.5 block text-xs font-medium">
                Account name
              </Label>
              <Input
                id="onboarding-account"
                autoFocus
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. HDFC Savings"
                className="bg-card h-auto w-full rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium">Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setAccountType(value)}
                    aria-pressed={accountType === value}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium transition-all ${
                      accountType === value
                        ? 'bg-grad-primary text-white shadow'
                        : 'bg-card text-muted-foreground'
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium">Colour</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`Colour ${c}`}
                    aria-pressed={color === c}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      color === c ? 'ring-foreground/40 scale-110 ring-2 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                size="lg"
                className="bg-grad-primary shadow-glow-primary w-full text-white"
                disabled={!trimmedAccountName}
                onClick={() => setStep('balance')}
              >
                Continue <ArrowRight size={16} />
              </Button>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('name')}>
                  <ArrowLeft size={14} /> Back
                </Button>
                <Button variant="ghost" size="sm" onClick={() => finish(false)}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'balance' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">
                {accountType === 'credit' ? 'How much do you owe?' : "What's in it right now?"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {accountType === 'credit'
                  ? `The current outstanding balance on ${trimmedAccountName}. You can change it later.`
                  : `The opening balance for ${trimmedAccountName}. You can change it later.`}
              </p>
            </div>

            <NumberPad value={balance} onChange={setBalance} />

            <div className="space-y-2">
              <Button
                size="lg"
                className="bg-grad-primary shadow-glow-primary w-full text-white"
                onClick={() => finish(true)}
              >
                Start tracking
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep('account')}>
                <ArrowLeft size={14} /> Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
