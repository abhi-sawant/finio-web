import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { MISC_CATEGORY_ID } from '@/data/defaultData';
import { calculateEmi } from '@/utils/loan';
import { activeAccounts } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';
import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/use-confirm';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

/** Loan/EMI in the default set — the sane default for a new loan's category. */
const DEFAULT_LOAN_CATEGORY_ID = 'cat-27';

export default function AddLoan() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id } = useParams();
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const loans = useFinanceStore((s) => s.loans);
  const addLoan = useFinanceStore((s) => s.addLoan);
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);

  const existing = id ? loans.find((l) => l.id === id) : null;
  const openAccounts = useMemo(() => activeAccounts(accounts), [accounts]);
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' || c.type === 'both'),
    [categories],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [principal, setPrincipal] = useState(existing?.principal.toString() ?? '0');
  const [interestRate, setInterestRate] = useState(existing?.interestRate.toString() ?? '');
  const [tenureMonths, setTenureMonths] = useState(existing?.tenureMonths.toString() ?? '');
  const [startDate, setStartDate] = useState(
    existing?.startDate ? existing.startDate.slice(0, 10) : '',
  );
  const [accountId, setAccountId] = useState(existing?.accountId ?? openAccounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ??
      (categories.some((c) => c.id === DEFAULT_LOAN_CATEGORY_ID)
        ? DEFAULT_LOAN_CATEGORY_ID
        : MISC_CATEGORY_ID),
  );

  const parsedPrincipal = parseFloat(principal) || 0;
  const parsedRate = parseFloat(interestRate) || 0;
  const parsedTenure = parseInt(tenureMonths, 10) || 0;
  const previewEmi = calculateEmi(parsedPrincipal, parsedRate, parsedTenure);

  const canSubmit =
    name.trim() !== '' &&
    parsedPrincipal > 0 &&
    parsedTenure > 0 &&
    startDate !== '' &&
    accountId !== '' &&
    categoryId !== '';

  const handleSubmit = () => {
    if (!canSubmit) return;

    const data = {
      name: name.trim(),
      principal: parsedPrincipal,
      interestRate: parsedRate,
      tenureMonths: parsedTenure,
      startDate: new Date(`${startDate}T00:00:00`).toISOString(),
      accountId,
      categoryId,
    };

    if (existing) {
      updateLoan(existing.id, data);
    } else {
      addLoan(data);
    }
    navigate(-1);
  };

  const handleDelete = async () => {
    if (!existing) return;
    const confirmed = await confirm({
      title: `Delete "${existing.name}"?`,
      description:
        'Every prepayment logged against it and its auto-generated EMI rule will be removed too. EMI transactions already posted stay in your history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      deleteLoan(existing.id);
      navigate(-1);
    }
  };

  return (
    <>
      <Header innerClassName="lg:max-w-xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">{existing ? 'Edit Loan' : 'Add Loan'}</h1>
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

      <Main className="lg:max-w-xl">
        <div>
          <Label htmlFor="loanName" className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Loan Name
          </Label>
          <Input
            id="loanName"
            type="text"
            placeholder="e.g., Home Loan — HDFC"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-card h-auto rounded-xl px-4 py-3"
          />
        </div>

        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Principal
          </Label>
          <NumberPad value={principal} onChange={setPrincipal} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label
              htmlFor="interestRate"
              className="text-muted-foreground mb-1.5 block text-xs font-medium"
            >
              Interest Rate (% p.a.)
            </Label>
            <Input
              id="interestRate"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="e.g. 8.5"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="bg-card h-auto rounded-xl px-4 py-3"
            />
          </div>
          <div>
            <Label
              htmlFor="tenureMonths"
              className="text-muted-foreground mb-1.5 block text-xs font-medium"
            >
              Tenure (months)
            </Label>
            <Input
              id="tenureMonths"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="e.g. 240"
              value={tenureMonths}
              onChange={(e) => setTenureMonths(e.target.value)}
              className="bg-card h-auto rounded-xl px-4 py-3"
            />
          </div>
        </div>

        {previewEmi > 0 && (
          <div className="card-elevated bg-grad-primary-soft rounded-2xl p-4 text-center">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Estimated EMI
            </p>
            <p className="text-lg font-bold">{formatCurrency(previewEmi)}/month</p>
          </div>
        )}

        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            First EMI Date
          </Label>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Pick a date" />
        </div>

        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Pay EMI From
          </Label>
          {openAccounts.length === 0 ? (
            <p className="text-destructive text-xs">Add an account first.</p>
          ) : (
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
                <SelectValue>
                  {openAccounts.find((a) => a.id === accountId)?.name ?? 'Choose account'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {openAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Category
          </Label>
          <div className="scrollbar-hide grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
            {expenseCategories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-all ${
                    selected ? 'ring-grad-primary border-transparent' : 'border-border bg-card hover:bg-muted'
                  }`}
                  style={
                    selected
                      ? { backgroundImage: `linear-gradient(135deg, ${cat.color}22, ${cat.color}11)` }
                      : undefined
                  }
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundImage: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` }}
                  >
                    <CategoryIcon icon={cat.icon} size={14} color="white" />
                  </div>
                  <span className="line-clamp-2 text-[10px] leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-xl py-3.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {existing ? 'Update Loan' : 'Add Loan'}
        </Button>
      </Main>
    </>
  );
}
