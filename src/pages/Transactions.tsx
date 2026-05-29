import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { formatDate } from '@/utils/formatters';
import { groupTransactionsByDate, transactionsToCsv } from '@/utils/calculations';
import { TransactionItem } from '@/components/transactions/TransactionItem';
import { Button } from '@/components/ui/button';
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
    <div className="px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleExportCsv}
            className="w-9 h-9 rounded-full bg-card hover:bg-muted"
            aria-label="Export CSV"
          >
            <Download size={16} />
          </Button>
          <Button
            variant={hasActiveFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`w-9 h-9 rounded-full transition-all ${
              hasActiveFilters
                ? 'bg-grad-primary text-white border-transparent shadow-glow-primary'
                : 'bg-card'
            }`}
            aria-label="Toggle filters"
          >
            <Filter size={16} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          type="text"
          placeholder="Search notes or categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-auto w-full pl-9 pr-4 py-2.5 bg-card rounded-xl"
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-3 card-elevated rounded-2xl p-3">
          <div>
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Type</Label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'expense', 'income', 'transfer'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
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
            <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">Account</Label>
            <Select value={accountFilter} onValueChange={(v) => setAccountFilter(v ?? 'all')}>
              <SelectTrigger className="w-full h-auto px-3 py-2 bg-muted rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-auto px-3 py-2 bg-muted rounded-lg"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground font-medium mb-1.5 block">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-auto px-3 py-2 bg-muted rounded-lg"
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
              className="h-auto p-0 flex items-center gap-1 text-xs text-destructive font-medium hover:bg-transparent hover:text-destructive"
            >
              <X size={12} /> Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Transaction List */}
      {grouped.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.date}>
              <p className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background/80 backdrop-blur py-1 z-10">
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
    </div>
  );
}

