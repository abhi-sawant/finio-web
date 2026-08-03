import { useState } from 'react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { reconciliationAdjustment } from '@/store/balance';
import { MISC_CATEGORY_ID } from '@/data/defaultData';
import { formatCurrency } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Account } from '@/types';

interface ReconcileAccountDialogProps {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Statement balance in, adjustment transaction out. `Account.balance` is a cache derived from
 * transactions (see balance.ts) — this is the user-facing way to close any gap against a real
 * bank/card statement without hand-editing a transaction to fake it.
 */
export function ReconcileAccountDialog({
  account,
  open,
  onOpenChange,
}: ReconcileAccountDialogProps) {
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const isCredit = account.type === 'credit';

  const [statementInput, setStatementInput] = useState('0');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<'input' | 'result'>('input');

  const reset = () => {
    setStatementInput('0');
    setNote('');
    setPhase('input');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // Credit accounts store balance as a negative "amount owed"; the statement shows a positive
  // due amount, so it has to be negated before it's comparable to `account.balance`.
  const parsedStatement = parseFloat(statementInput) || 0;
  const effectiveStatement = isCredit ? -parsedStatement : parsedStatement;
  const adjustment = reconciliationAdjustment(account.balance, effectiveStatement);

  const handleCompare = () => setPhase('result');

  const handleConfirm = () => {
    if (adjustment.type === null) return;
    const transactionId = addTransaction({
      type: adjustment.type,
      amount: adjustment.amount,
      accountId: account.id,
      categoryId: MISC_CATEGORY_ID,
      date: new Date().toISOString(),
      note: note.trim() || `Balance adjustment for ${account.name}`,
      labels: [],
    });
    toast.success(`Adjustment posted to "${account.name}"`, {
      action: { label: 'Undo', onClick: () => deleteTransaction(transactionId) },
    });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card top-1/4 mx-auto w-11/12 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reconcile "{account.name}"</DialogTitle>
        </DialogHeader>

        {phase === 'input' ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              Enter the balance from your {isCredit ? 'card statement' : 'bank statement'} and
              we'll show you the difference against what Finio has on record (
              {formatCurrency(isCredit ? Math.abs(account.balance) : account.balance)}).
            </p>
            <Label className="text-muted-foreground block text-xs font-medium">
              {isCredit ? 'Statement due' : 'Statement balance'}
            </Label>
            <NumberPad value={statementInput} onChange={setStatementInput} />
            <Button
              onClick={handleCompare}
              className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-lg py-2 text-sm font-medium text-white"
            >
              Compare
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {adjustment.type === null ? (
              <p className="text-sm">
                You're all set — Finio already matches your statement.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Off by{' '}
                  <span
                    className={
                      adjustment.type === 'income' ? 'text-emerald-500' : 'text-rose-500'
                    }
                  >
                    {adjustment.type === 'income' ? '+' : '−'}
                    {formatCurrency(adjustment.amount)}
                  </span>
                  . We'll add a{' '}
                  {adjustment.type === 'income' ? 'balance-up income' : 'balance-down expense'}{' '}
                  adjustment, categorized as Miscellaneous, so you can re-categorize it later.
                </p>
                <Input
                  type="text"
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-muted h-auto rounded-lg px-3 py-2"
                />
              </>
            )}
            <div className="flex gap-2">
              {adjustment.type !== null && (
                <Button
                  onClick={handleConfirm}
                  className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
                >
                  Add adjustment
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => (adjustment.type === null ? handleOpenChange(false) : setPhase('input'))}
                className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
              >
                {adjustment.type === null ? 'Close' : 'Back'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
