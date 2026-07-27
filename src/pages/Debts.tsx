import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  ChevronDown,
  HandCoins,
  History,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { MISC_CATEGORY_ID } from '@/data/defaultData';
import { formatCurrency, formatFullDate } from '@/utils/formatters';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
import { PersonIcon } from '@/components/people/PersonIcon';
import { PERSON_ICONS } from '@/components/people/personIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberPad } from '@/components/ui/number-pad';
import { useConfirm } from '@/components/ui/use-confirm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { computePersonBalance, activeAccounts, type PersonBalance } from '@/utils/calculations';
import type { DebtEntry, Person } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const personColors = [
  '#6C63FF',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export default function Debts() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const people = useFinanceStore((s) => s.people);
  const debtEntries = useFinanceStore((s) => s.debtEntries);
  const accounts = useFinanceStore((s) => s.accounts);
  const addPerson = useFinanceStore((s) => s.addPerson);
  const updatePerson = useFinanceStore((s) => s.updatePerson);
  const deletePerson = useFinanceStore((s) => s.deletePerson);
  const addDebtEntry = useFinanceStore((s) => s.addDebtEntry);
  const deleteDebtEntry = useFinanceStore((s) => s.deleteDebtEntry);
  const restoreDebtEntry = useFinanceStore((s) => s.restoreDebtEntry);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(PERSON_ICONS[0]);
  const [color, setColor] = useState(personColors[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [entryPerson, setEntryPerson] = useState<{ person: Person; mode: 'lend' | 'borrow' } | null>(
    null,
  );
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const [settlePerson, setSettlePerson] = useState<PersonBalance | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleNote, setSettleNote] = useState('');

  const openAccounts = useMemo(() => activeAccounts(accounts), [accounts]);

  const balances = useMemo(
    () => people.map((p) => computePersonBalance(p, debtEntries)),
    [people, debtEntries],
  );

  // Anyone with an open balance first (bigger balances first), settled-up people trail behind.
  const sortedBalances = useMemo(
    () =>
      [...balances].sort((a, b) => {
        const aSettled = a.balance === 0;
        const bSettled = b.balance === 0;
        if (aSettled !== bSettled) return aSettled ? 1 : -1;
        return Math.abs(b.balance) - Math.abs(a.balance);
      }),
    [balances],
  );

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setIcon(PERSON_ICONS[0]);
    setColor(personColors[0]);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setName(person.name);
    setIcon(person.icon);
    setColor(person.color);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Enter a name');
      return;
    }

    const data = { name: name.trim(), icon, color };

    if (editingId) {
      updatePerson(editingId, data);
      toast.success('Person updated');
    } else {
      addPerson(data);
      toast.success('Person added');
    }
    resetForm();
  };

  const openEntry = (person: Person, mode: 'lend' | 'borrow') => {
    setEntryPerson({ person, mode });
    setEntryAmount('');
    setEntryNote('');
  };

  const handleEntrySubmit = () => {
    if (!entryPerson) return;
    const parsed = parseFloat(entryAmount);
    if (!parsed || parsed <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    addDebtEntry({
      personId: entryPerson.person.id,
      // Lending them money (or something they owe you for) increases what they owe you;
      // borrowing from them increases what you owe them.
      amount: entryPerson.mode === 'borrow' ? -parsed : parsed,
      date: new Date().toISOString(),
      note: entryNote.trim(),
    });
    toast.success(entryPerson.mode === 'borrow' ? 'Borrowing logged' : 'Lending logged');
    setEntryPerson(null);
  };

  const openSettle = (status: PersonBalance) => {
    setSettlePerson(status);
    setSettleAmount(String(Math.abs(status.balance)));
    setSettleAccountId(openAccounts[0]?.id ?? '');
    setSettleNote('');
  };

  const handleSettleSubmit = () => {
    if (!settlePerson) return;
    const parsed = parseFloat(settleAmount);
    if (!parsed || parsed <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!settleAccountId) {
      toast.error('Choose an account');
      return;
    }

    const { person, balance } = settlePerson;
    // They owe you → settling means they pay you back, an income into the chosen account.
    // You owe them → settling means you pay them, an expense out of the chosen account.
    const type = balance > 0 ? 'income' : 'expense';
    const note = settleNote.trim() || `Settled up with ${person.name}`;
    const date = new Date().toISOString();

    const transactionId = addTransaction({
      type,
      amount: parsed,
      accountId: settleAccountId,
      categoryId: MISC_CATEGORY_ID,
      date,
      note,
      labels: [],
    });
    const entryId = addDebtEntry({
      personId: person.id,
      amount: balance > 0 ? -parsed : parsed,
      date,
      note,
      settledTransactionId: transactionId,
    });

    toast.success(`Settled ${formatCurrency(parsed)} with ${person.name}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          deleteTransaction(transactionId);
          deleteDebtEntry(entryId);
        },
      },
    });
    setSettlePerson(null);
  };

  return (
    <>
      <Header innerClassName="lg:max-w-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Debts & Lending</h1>
        <div className="flex gap-1">
          <HideAmountsToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (showForm ? resetForm() : startCreate())}
            className="text-primary hover:bg-primary/10 h-9 w-9 rounded-full"
            aria-label="Add person"
          >
            <Plus size={20} />
          </Button>
        </div>
      </Header>

      <Main className="lg:max-w-xl">
        {showForm && (
          <div className="card-elevated space-y-3 rounded-2xl p-4">
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Name
              </Label>
              <Input
                type="text"
                placeholder="e.g., Rahul"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-muted h-auto rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Icon</Label>
              <div className="grid grid-cols-6 gap-2">
                {PERSON_ICONS.map((i) => (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`flex h-9 items-center justify-center rounded-lg border transition-colors ${
                      icon === i ? 'border-primary bg-primary/10' : 'border-border bg-card'
                    }`}
                    aria-label={i}
                  >
                    <PersonIcon icon={i} size={16} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Color
              </Label>
              <div className="flex flex-wrap gap-3">
                {personColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      color === c ? 'ring-primary scale-110 ring-2 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                {editingId ? 'Save Changes' : 'Save'}
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
        )}

        {sortedBalances.length === 0 ? (
          <div className="py-12 text-center">
            <div className="bg-grad-primary-soft mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full">
              <HandCoins size={22} className="text-primary" />
            </div>
            <p className="text-muted-foreground mb-4">No one on your ledger yet</p>
            <Button
              onClick={startCreate}
              className="bg-grad-primary shadow-glow-primary h-auto rounded-xl px-5 py-2.5 text-sm font-medium text-white"
            >
              Add your first person
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedBalances.map((status) => (
              <PersonCard
                key={status.person.id}
                status={status}
                entries={debtEntries.filter((e) => e.personId === status.person.id)}
                expanded={expandedId === status.person.id}
                onToggleHistory={() =>
                  setExpandedId((id) => (id === status.person.id ? null : status.person.id))
                }
                onLend={() => openEntry(status.person, 'lend')}
                onBorrow={() => openEntry(status.person, 'borrow')}
                onSettle={() => openSettle(status)}
                onEdit={() => startEdit(status.person)}
                onDelete={async () => {
                  const confirmed = await confirm({
                    title: `Delete "${status.person.name}"?`,
                    description:
                      'Every debt entry logged against this person will be deleted too. This cannot be undone.',
                    confirmLabel: 'Delete person',
                  });
                  if (confirmed) deletePerson(status.person.id);
                }}
                onDeleteEntry={(id) => {
                  const removed = deleteDebtEntry(id);
                  if (!removed) return;
                  toast.success('Entry removed', {
                    action: { label: 'Undo', onClick: () => restoreDebtEntry(removed) },
                  });
                }}
              />
            ))}
          </div>
        )}
      </Main>

      {/* Lend / borrow entry dialog */}
      <Dialog
        open={entryPerson !== null}
        onOpenChange={(v) => {
          if (!v) setEntryPerson(null);
        }}
      >
        <DialogContent className="bg-card top-1/4 mx-auto w-11/12 rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {entryPerson?.mode === 'borrow' ? 'Borrowed from' : 'Lent to'} {entryPerson?.person.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <NumberPad value={entryAmount} onChange={setEntryAmount} />
            <Input
              type="text"
              placeholder="Note (optional)"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              className="bg-muted h-auto rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleEntrySubmit}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => setEntryPerson(null)}
                className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settle up dialog */}
      <Dialog
        open={settlePerson !== null}
        onOpenChange={(v) => {
          if (!v) setSettlePerson(null);
        }}
      >
        <DialogContent className="bg-card top-1/4 mx-auto w-11/12 rounded-2xl">
          <DialogHeader>
            <DialogTitle>Settle up with {settlePerson?.person.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {settlePerson && settlePerson.balance > 0
                ? `They owe you ${formatCurrency(settlePerson.balance)}. Record what they paid you back.`
                : `You owe ${formatCurrency(Math.abs(settlePerson?.balance ?? 0))}. Record what you paid them.`}
            </p>
            <NumberPad value={settleAmount} onChange={setSettleAmount} />

            {openAccounts.length === 0 ? (
              <p className="text-destructive text-xs">
                Add an account first — settling up records a real transaction.
              </p>
            ) : (
              <Select value={settleAccountId} onValueChange={(v) => setSettleAccountId(v ?? '')}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue>
                    {openAccounts.find((a) => a.id === settleAccountId)?.name ?? 'Choose account'}
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

            <Input
              type="text"
              placeholder="Note (optional)"
              value={settleNote}
              onChange={(e) => setSettleNote(e.target.value)}
              className="bg-muted h-auto rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSettleSubmit}
                disabled={openAccounts.length === 0}
                className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
              >
                Settle
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSettlePerson(null)}
                className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface PersonCardProps {
  status: PersonBalance;
  entries: DebtEntry[];
  expanded: boolean;
  onToggleHistory: () => void;
  onLend: () => void;
  onBorrow: () => void;
  onSettle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteEntry: (id: string) => void;
}

function PersonCard({
  status,
  entries,
  expanded,
  onToggleHistory,
  onLend,
  onBorrow,
  onSettle,
  onEdit,
  onDelete,
  onDeleteEntry,
}: PersonCardProps) {
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const { person, balance, lastActivity } = status;
  const isSettled = balance === 0;
  const theyOweYou = balance > 0;

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundImage: `linear-gradient(135deg, ${person.color}, ${person.color}cc)` }}
          >
            <PersonIcon icon={person.icon} size={16} color="white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{person.name}</p>
            <p className="text-muted-foreground truncate text-[11px]">
              {lastActivity ? `Last activity ${formatFullDate(lastActivity)}` : 'No activity yet'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7" aria-label="Edit">
            <Pencil size={13} className="text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-7 w-7"
            aria-label="Delete"
          >
            <Trash2 size={13} className="text-destructive" />
          </Button>
        </div>
      </div>

      <p
        className={`mb-3 text-sm font-medium ${
          isSettled ? 'text-muted-foreground' : theyOweYou ? 'text-emerald-500' : 'text-rose-500'
        }`}
      >
        {isSettled
          ? 'Settled up'
          : theyOweYou
            ? `Owes you ${formatCurrency(balance, false, hideAmounts)}`
            : `You owe ${formatCurrency(Math.abs(balance), false, hideAmounts)}`}
      </p>

      <div className="flex gap-2">
        <Button
          onClick={onLend}
          className="bg-grad-success h-auto flex-1 rounded-lg py-2 text-xs font-medium text-white"
        >
          <Plus size={13} className="mr-1" /> They owe me
        </Button>
        <Button
          variant="secondary"
          onClick={onBorrow}
          className="bg-muted text-muted-foreground h-auto flex-1 rounded-lg py-2 text-xs font-medium"
        >
          <Minus size={13} className="mr-1" /> I owe them
        </Button>
      </div>
      {!isSettled && (
        <Button
          variant="secondary"
          onClick={onSettle}
          className="bg-primary/10 text-primary mt-2 h-auto w-full rounded-lg py-2 text-xs font-medium"
        >
          Settle up
        </Button>
      )}

      <button
        onClick={onToggleHistory}
        className="text-muted-foreground mt-2 flex items-center gap-1 text-[11px] font-medium"
        aria-expanded={expanded}
      >
        <History size={12} />
        History
        <ChevronDown
          size={12}
          className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {expanded && (
        <div className="border-border mt-2 space-y-1.5 border-t pt-2">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-[11px]">No entries logged yet.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground w-14 shrink-0">
                  {format(parseISO(e.date), 'd MMM')}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {e.note ||
                    (e.settledTransactionId
                      ? 'Settled up'
                      : e.amount < 0
                        ? 'You owe more'
                        : 'They owe more')}
                </span>
                <span
                  className={`shrink-0 font-medium ${e.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}
                >
                  {e.amount < 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(e.amount), true, hideAmounts)}
                </span>
                <button
                  onClick={() => onDeleteEntry(e.id)}
                  aria-label="Delete entry"
                  className="text-muted-foreground shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
