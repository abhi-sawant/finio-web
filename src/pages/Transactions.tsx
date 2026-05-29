import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatDate } from '@/utils/formatters';
import { groupTransactionsByDate, transactionsToCsv } from '@/utils/calculations';
import { TransactionItem } from '@/components/transactions/TransactionItem';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

export default function Transactions() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const accounts = useFinanceStore((s) => s.accounts);
  const currency = useFinanceStore((s) => s.settings.currency);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    const q = search.trim().toLowerCase();
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
      if (q) {
        if (t.note.toLowerCase().includes(q)) return true;
        const catName = catMap.get(t.categoryId);
        if (catName?.includes(q)) return true;
        return false;
      }
      return true;
    });
  }, [transactions, search, typeFilter, accountFilter, categories, fromDate, toDate]);

  const grouped = useMemo(() => groupTransactionsByDate(filtered), [filtered]);

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

  return (
    <>
      {/* Header */}
      <Header>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <div className="flex gap-2">
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
      <Main>
        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="text-muted-foreground absolute top-1/2 left-3 z-10 -translate-y-1/2"
          />
          <Input
            type="text"
            placeholder="Search notes or categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card h-auto w-full rounded-xl py-2.5 pr-4 pl-9"
          />
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
                  <SelectValue>{accounts.find((a) => a.id === accountFilter)?.name || 'All Accounts'}</SelectValue>
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
                <DatePicker
                  value={fromDate}
                  onChange={setFromDate}
                  placeholder="Start date"
                />
              </div>
              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">To</Label>
                <DatePicker
                  value={toDate}
                  onChange={setToDate}
                  placeholder="End date"
                />
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
        {grouped.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No transactions found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.date}>
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  {formatDate(group.date)}
                </p>
                <div className="space-y-2">
                  {group.transactions.map((tx) => (
                    <TransactionItem
                      key={tx.id}
                      transaction={tx}
                      categories={categories}
                      accounts={accounts}
                      currency={currency}
                      onClick={() => navigate(`/edit-transaction/${tx.id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Main>
    </>
  );
}
