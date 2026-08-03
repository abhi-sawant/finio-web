import { useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, X, Download, Tag, Tags, Trash2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  buildSearchIndex,
  groupTransactionsByDate,
  transactionMatchesQuery,
  transactionsToCsv,
} from '@/utils/calculations';
import { TransactionItem, type TransactionRowAction } from '@/components/transactions/TransactionItem';
import { HideAmountsToggle } from '@/components/HideAmountsToggle';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Transaction, TransactionType } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

type VirtualRow = { kind: 'header'; date: string } | { kind: 'tx'; tx: Transaction };

export default function Transactions() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const accounts = useFinanceStore((s) => s.accounts);
  const labels = useFinanceStore((s) => s.labels);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const restoreTransaction = useFinanceStore((s) => s.restoreTransaction);
  const bulkDeleteTransactions = useFinanceStore((s) => s.bulkDeleteTransactions);
  const restoreTransactions = useFinanceStore((s) => s.restoreTransactions);
  const bulkRecategorize = useFinanceStore((s) => s.bulkRecategorize);
  const bulkAddLabel = useFinanceStore((s) => s.bulkAddLabel);
  const addTemplate = useFinanceStore((s) => s.addTemplate);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Bulk selection mode, entered via a row's long-press menu.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // "Save as template" naming dialog.
  const [templateTx, setTemplateTx] = useState<Transaction | null>(null);
  const [templateName, setTemplateName] = useState('');

  // Bulk recategorize / add-label dialogs.
  const [recategorizeOpen, setRecategorizeOpen] = useState(false);
  const [recategorizeCategoryId, setRecategorizeCategoryId] = useState('');
  const [addLabelOpen, setAddLabelOpen] = useState(false);
  const [addLabelId, setAddLabelId] = useState('');

  // Ref to the scrollable <main> element for the virtualizer
  const scrollRef = useRef<HTMLElement>(null);

  const filtered = useMemo(() => {
    const index = buildSearchIndex(categories, accounts, labels);
    const q = search.trim();
    const fromMs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : null;
    const toMs = toDate ? new Date(toDate + 'T23:59:59').getTime() : null;

    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (
        accountFilter !== 'all' &&
        t.accountId !== accountFilter &&
        t.toAccountId !== accountFilter
      )
        return false;
      if (fromMs !== null || toMs !== null) {
        const ts = new Date(t.date).getTime();
        if (fromMs !== null && ts < fromMs) return false;
        if (toMs !== null && ts > toMs) return false;
      }
      return transactionMatchesQuery(t, q, index);
    });
  }, [
    transactions,
    search,
    typeFilter,
    accountFilter,
    categories,
    accounts,
    labels,
    fromDate,
    toDate,
  ]);

  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of filtered) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    }
    return { totalIncome: income, totalExpense: expense };
  }, [filtered]);

  // Flatten grouped transactions into a single array for the virtualizer
  const virtualRows = useMemo<VirtualRow[]>(() => {
    const groups = groupTransactionsByDate(filtered);
    const rows: VirtualRow[] = [];
    for (const group of groups) {
      rows.push({ kind: 'header', date: group.date });
      for (const tx of group.transactions) {
        rows.push({ kind: 'tx', tx });
      }
    }
    return rows;
  }, [filtered]);

  // TanStack Virtual's returned functions (scrollToIndex, measure, etc.) are stable across
  // renders by the library's own contract, so React Compiler's inability to verify that and
  // skip memoizing this component is a known false positive, not a real staleness risk.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (virtualRows[index].kind === 'header' ? 28 : 68),
    overscan: 8,
  });

  const hasActiveFilters =
    typeFilter !== 'all' || accountFilter !== 'all' || !!fromDate || !!toDate;

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    const csv = transactionsToCsv(filtered, categories, accounts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finio-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} transactions`);
  };

  const handleNavigate = useCallback(
    (id: string) => navigate(`/edit-transaction/${id}`),
    [navigate],
  );

  const enterSelectionMode = (tx: Transaction) => {
    setSelectionMode(true);
    setSelectedIds(new Set([tx.id]));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowLongPressAction = (action: TransactionRowAction, tx: Transaction) => {
    if (action === 'select') {
      enterSelectionMode(tx);
      return;
    }
    if (action === 'duplicate') {
      // A duplicate is a fresh, manually-entered transaction — dated today, not linked to
      // whatever recurring rule (if any) generated the original.
      const newId = addTransaction({
        type: tx.type,
        amount: tx.amount,
        accountId: tx.accountId,
        ...(tx.toAccountId ? { toAccountId: tx.toAccountId } : {}),
        categoryId: tx.categoryId,
        date: new Date().toISOString(),
        note: tx.note,
        labels: tx.labels,
        ...(tx.splits ? { splits: tx.splits } : {}),
      });
      toast.success('Transaction duplicated', {
        action: { label: 'Undo', onClick: () => deleteTransaction(newId) },
      });
      return;
    }
    if (action === 'template') {
      setTemplateName(tx.note || '');
      setTemplateTx(tx);
      return;
    }
    // delete
    const removed = deleteTransaction(tx.id);
    if (!removed) return;
    toast.success('Transaction deleted', {
      action: { label: 'Undo', onClick: () => restoreTransaction(removed) },
    });
  };

  const handleSaveTemplate = () => {
    if (!templateTx) return;
    addTemplate({
      name: templateName.trim() || templateTx.note || 'Template',
      type: templateTx.type,
      amount: templateTx.amount,
      accountId: templateTx.accountId,
      ...(templateTx.toAccountId ? { toAccountId: templateTx.toAccountId } : {}),
      categoryId: templateTx.categoryId,
      note: templateTx.note,
      labels: templateTx.labels,
      ...(templateTx.splits ? { splits: templateTx.splits } : {}),
    });
    toast.success('Template saved');
    setTemplateTx(null);
    setTemplateName('');
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    const removed = bulkDeleteTransactions(ids);
    exitSelectionMode();
    if (removed.length === 0) return;
    toast.success(`Deleted ${removed.length} transaction${removed.length === 1 ? '' : 's'}`, {
      action: { label: 'Undo', onClick: () => restoreTransactions(removed) },
    });
  };

  const handleBulkRecategorize = () => {
    if (!recategorizeCategoryId) return;
    const count = selectedIds.size;
    bulkRecategorize(Array.from(selectedIds), recategorizeCategoryId);
    toast.success(`Recategorized ${count} transaction${count === 1 ? '' : 's'}`);
    setRecategorizeOpen(false);
    setRecategorizeCategoryId('');
    exitSelectionMode();
  };

  const handleBulkAddLabel = () => {
    if (!addLabelId) return;
    const count = selectedIds.size;
    bulkAddLabel(Array.from(selectedIds), addLabelId);
    toast.success(`Label added to ${count} transaction${count === 1 ? '' : 's'}`);
    setAddLabelOpen(false);
    setAddLabelId('');
    exitSelectionMode();
  };

  const items = virtualizer.getVirtualItems();

  return (
    <>
      {/* Header */}
      <Header>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <div className="flex gap-2">
          <HideAmountsToggle />
          <Button
            variant="outline"
            size="icon"
            onClick={handleExportCsv}
            className="bg-card hover:bg-muted h-9 w-9 rounded-full"
            aria-label="Export CSV"
          >
            <Download size={16} />
          </Button>
          <Button
            variant={hasActiveFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-9 w-9 rounded-full transition-all ${
              hasActiveFilters
                ? 'bg-grad-primary shadow-glow-primary border-transparent text-white'
                : 'bg-card'
            }`}
            aria-label="Toggle filters"
          >
            <Filter size={16} />
          </Button>
        </div>
      </Header>
      <Main ref={scrollRef}>
        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="text-muted-foreground absolute top-1/2 left-3 z-10 -translate-y-1/2"
          />
          <Input
            type="text"
            placeholder="Search notes, categories, accounts, labels, amounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card h-auto w-full rounded-xl py-2.5 pr-4 pl-9"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-xs">
            Earned{' '}
            <span className="font-bold text-emerald-500">
              {formatCurrency(totalIncome, false, hideAmounts)}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            Spent{' '}
            <span className="font-bold text-rose-500">
              {formatCurrency(totalExpense, false, hideAmounts)}
            </span>
          </span>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="card-elevated space-y-3 rounded-2xl p-3">
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">Type</Label>
              <div className="flex flex-wrap gap-2">
                {(['all', 'expense', 'income', 'transfer'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                      typeFilter === type
                        ? 'bg-grad-primary text-white shadow'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Account
              </Label>
              <Select value={accountFilter} onValueChange={(v) => setAccountFilter(v ?? 'all')}>
                <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
                  <SelectValue>
                    {accounts.find((a) => a.id === accountFilter)?.name || 'All Accounts'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  From
                </Label>
                <DatePicker value={fromDate} onChange={setFromDate} placeholder="Start date" />
              </div>
              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">To</Label>
                <DatePicker value={toDate} onChange={setToDate} placeholder="End date" />
              </div>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTypeFilter('all');
                  setAccountFilter('all');
                  setFromDate('');
                  setToDate('');
                }}
                className="text-destructive hover:text-destructive flex h-auto items-center gap-1 p-0 text-xs font-medium hover:bg-transparent"
              >
                <X size={12} /> Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Transaction List */}
        {virtualRows.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No transactions found</p>
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px` }} className="relative w-full">
            {items.map((virtualItem) => {
              const row = virtualRows[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                  className="absolute top-0 left-0 w-full"
                >
                  {row.kind === 'header' ? (
                    <p className="text-muted-foreground pb-2 text-xs font-medium">
                      {formatDate(row.date)}
                    </p>
                  ) : (
                    <div className="pb-2">
                      <TransactionItem
                        transaction={row.tx}
                        categories={categories}
                        accounts={accounts}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(row.tx.id)}
                        onLongPressAction={handleRowLongPressAction}
                        onClick={() =>
                          selectionMode ? toggleSelected(row.tx.id) : handleNavigate(row.tx.id)
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Main>

      {/* Bulk selection toolbar */}
      {selectionMode && (
        <div className="border-border bg-card fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] z-40 flex items-center gap-2 border-t py-2.5 pr-20 pl-3 shadow-lg lg:bottom-0 lg:left-60 lg:pr-4">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAddLabelOpen(true)}
              disabled={selectedIds.size === 0}
              className="h-9 w-9 rounded-full"
              aria-label="Add label"
            >
              <Tags size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRecategorizeOpen(true)}
              disabled={selectedIds.size === 0}
              className="h-9 w-9 rounded-full"
              aria-label="Recategorize"
            >
              <Tag size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0}
              className="text-destructive hover:bg-destructive/10 h-9 w-9 rounded-full"
              aria-label="Delete selected"
            >
              <Trash2 size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exitSelectionMode}
              className="h-9 w-9 rounded-full"
              aria-label="Cancel selection"
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Save as template */}
      <Dialog open={!!templateTx} onOpenChange={(open) => !open && setTemplateTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Reuse this transaction's account, category, amount and labels from the FAB later.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="bg-card h-auto rounded-xl px-4 py-3"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateTx(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} className="bg-grad-primary text-white">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk recategorize */}
      <Dialog open={recategorizeOpen} onOpenChange={setRecategorizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recategorize {selectedIds.size} transactions</DialogTitle>
            <DialogDescription>Every selected transaction moves to this category.</DialogDescription>
          </DialogHeader>
          <Select value={recategorizeCategoryId} onValueChange={(v) => setRecategorizeCategoryId(v ?? '')}>
            <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
              <SelectValue placeholder="Select category">
                {categories.find((c) => c.id === recategorizeCategoryId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecategorizeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkRecategorize}
              disabled={!recategorizeCategoryId}
              className="bg-grad-primary text-white"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add label */}
      <Dialog open={addLabelOpen} onOpenChange={setAddLabelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add label to {selectedIds.size} transactions</DialogTitle>
            <DialogDescription>
              Adds the label alongside any labels a transaction already has.
            </DialogDescription>
          </DialogHeader>
          <Select value={addLabelId} onValueChange={(v) => setAddLabelId(v ?? '')}>
            <SelectTrigger className="bg-muted h-auto w-full rounded-lg px-3 py-2">
              <SelectValue placeholder="Select label">
                {labels.find((l) => l.id === addLabelId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {labels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLabelOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAddLabel}
              disabled={!addLabelId}
              className="bg-grad-primary text-white"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
