import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, AlertTriangle, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { MISC_CATEGORY_ID } from '@/data/defaultData';
import { useFinanceStore } from '@/store/useFinanceStore';
import {
  DATE_FORMATS,
  buildTransactionsFromCsv,
  detectDateFormat,
  findDuplicateRows,
  parseCsvText,
  type AmountMode,
  type CsvImportResult,
  type CsvParseResult,
  type DateFormatCode,
} from '@/utils/csvImport';
import { formatCurrency, formatFullDate } from '@/utils/formatters';
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
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

type Step = 'upload' | 'map' | 'preview';

/** Sentinel for an optional column select — an empty string isn't a safe Select value here. */
const NONE = '__none__';

/** Large statements shouldn't make the preview table itself the bottleneck. */
const MAX_PREVIEW_ROWS = 200;

function colToStr(col: number | undefined): string {
  return col === undefined ? NONE : String(col);
}

function strToCol(value: string): number | undefined {
  return value === NONE || value === '' ? undefined : Number(value);
}

export default function ImportCsv() {
  const navigate = useNavigate();
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const bulkAddTransactions = useFinanceStore((s) => s.bulkAddTransactions);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt), [accounts]);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [skipRows, setSkipRows] = useState('0');
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);

  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '');
  const [dateCol, setDateCol] = useState(NONE);
  const [dateFormat, setDateFormat] = useState<DateFormatCode>('YYYY-MM-DD');
  const [amountMode, setAmountMode] = useState<AmountMode>('signed');
  const [amountCol, setAmountCol] = useState(NONE);
  const [negativeIsExpense, setNegativeIsExpense] = useState(true);
  const [debitCol, setDebitCol] = useState(NONE);
  const [creditCol, setCreditCol] = useState(NONE);
  const [noteCol, setNoteCol] = useState(NONE);
  const [categoryCol, setCategoryCol] = useState(NONE);

  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [duplicateRows, setDuplicateRows] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);

  const handleChooseFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const skip = Math.max(0, parseInt(skipRows, 10) || 0);
          const csv = parseCsvText(text, skip);
          if (csv.headers.length === 0 || csv.rows.length === 0) {
            toast.error('No data rows found — check "rows to skip"');
            return;
          }
          setParsed(csv);
          setFileName(file.name);

          // Best-effort auto-mapping: assume the first date-like column is the date, and the
          // first amount-like column is the amount — the user can always override.
          const dateGuess = csv.headers.findIndex((h) => /date/i.test(h));
          const amountGuess = csv.headers.findIndex((h) => /amount|amt/i.test(h));
          const noteGuess = csv.headers.findIndex((h) => /note|desc|narration|particular/i.test(h));
          if (dateGuess >= 0) {
            setDateCol(String(dateGuess));
            const samples = csv.rows.slice(0, 20).map((r) => r[dateGuess] ?? '');
            const detected = detectDateFormat(samples);
            if (detected) setDateFormat(detected);
          }
          if (amountGuess >= 0) setAmountCol(String(amountGuess));
          if (noteGuess >= 0) setNoteCol(String(noteGuess));

          setStep('map');
        } catch {
          toast.error('Could not read that file as CSV');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDateColChange = (value: string) => {
    setDateCol(value);
    if (!parsed) return;
    const col = strToCol(value);
    if (col === undefined) return;
    const samples = parsed.rows.slice(0, 20).map((r) => r[col] ?? '');
    const detected = detectDateFormat(samples);
    if (detected) setDateFormat(detected);
  };

  const canPreview =
    parsed !== null &&
    accountId !== '' &&
    dateCol !== NONE &&
    (amountMode === 'signed' ? amountCol !== NONE : debitCol !== NONE || creditCol !== NONE);

  const handlePreview = () => {
    if (!parsed || !canPreview) return;

    const built = buildTransactionsFromCsv(parsed.rows, {
      mapping: {
        dateCol: Number(dateCol),
        noteCol: strToCol(noteCol),
        categoryCol: strToCol(categoryCol),
        amountMode,
        amountCol: strToCol(amountCol),
        negativeIsExpense,
        debitCol: strToCol(debitCol),
        creditCol: strToCol(creditCol),
      },
      dateFormat,
      accountId,
      categories,
      fallbackCategoryId: MISC_CATEGORY_ID,
    });

    setResult(built);
    setDuplicateRows(findDuplicateRows(built.accepted, transactions));
    setStep('preview');
  };

  const toImport = useMemo(() => {
    if (!result) return [];
    return skipDuplicates
      ? result.accepted.filter((r) => !duplicateRows.has(r.rowIndex))
      : result.accepted;
  }, [result, duplicateRows, skipDuplicates]);

  const handleImport = () => {
    if (toImport.length === 0) return;
    setImporting(true);
    const added = bulkAddTransactions(toImport.map((r) => r.transaction));
    setImporting(false);
    toast.success(`Imported ${added} transaction${added === 1 ? '' : 's'}`);
    navigate('/transactions');
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Miscellaneous';

  const handleBack = () => {
    if (step === 'upload') navigate(-1);
    else if (step === 'map') setStep('upload');
    else setStep('map');
  };

  const stepTitle =
    step === 'upload' ? 'Import Bank CSV' : step === 'map' ? 'Map Columns' : 'Review & Import';

  return (
    <>
      <Header innerClassName="lg:max-w-2xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="h-9 w-9 rounded-full"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">{stepTitle}</h1>
        <div className="w-9" />
      </Header>

      <Main className="lg:max-w-2xl">
        {step === 'upload' && (
          <div className="space-y-4">
            {activeAccounts.length === 0 ? (
              <div className="card-elevated space-y-2 rounded-2xl p-4 text-sm">
                <p className="font-medium">Add an account first</p>
                <p className="text-muted-foreground text-xs">
                  A CSV import needs somewhere to attach the transactions.
                </p>
                <Button
                  onClick={() => navigate('/add-account')}
                  className="bg-grad-primary h-auto w-full rounded-xl py-2.5 text-sm font-medium text-white"
                >
                  Add Account
                </Button>
              </div>
            ) : (
              <>
                <div className="card-elevated space-y-3 rounded-2xl p-4">
                  <p className="text-sm">
                    Import transactions from a bank or card statement CSV. You'll map its columns
                    to Finio's fields on the next step, and review everything before it's added.
                  </p>
                  <div>
                    <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      Rows to skip before the header
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={skipRows}
                      onChange={(e) => setSkipRows(e.target.value)}
                      className="bg-card h-auto w-24 rounded-xl px-3 py-2"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Some statements have a few title lines before the real column headers.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleChooseFile}
                  className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                >
                  <FileUp size={16} className="mr-1.5" /> Choose CSV File
                </Button>
              </>
            )}
          </div>
        )}

        {step === 'map' && parsed && (
          <div className="space-y-4">
            <p className="text-muted-foreground truncate text-xs">{fileName}</p>

            <div className="card-elevated space-y-3 rounded-2xl p-4">
              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Account
                </Label>
                <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
                  <SelectTrigger className="bg-card h-auto w-full rounded-xl px-4 py-3">
                    <SelectValue placeholder="Select account">
                      {activeAccounts.find((a) => a.id === accountId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                    Date column
                  </Label>
                  <ColumnSelect
                    headers={parsed.headers}
                    value={dateCol}
                    onChange={handleDateColChange}
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                    Date format
                  </Label>
                  <Select
                    value={dateFormat}
                    onValueChange={(v) => setDateFormat((v as DateFormatCode) ?? dateFormat)}
                  >
                    <SelectTrigger className="bg-card h-auto w-full rounded-xl px-3 py-3 text-xs">
                      <SelectValue>
                        {DATE_FORMATS.find((f) => f.value === dateFormat)?.value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Amount columns
                </Label>
                <div className="bg-muted mb-2 grid grid-cols-2 gap-1 rounded-xl p-1">
                  {(['signed', 'debitCredit'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAmountMode(mode)}
                      className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                        amountMode === mode
                          ? 'bg-grad-primary text-white shadow'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {mode === 'signed' ? 'Single (signed)' : 'Debit & Credit'}
                    </button>
                  ))}
                </div>

                {amountMode === 'signed' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ColumnSelect headers={parsed.headers} value={amountCol} onChange={setAmountCol} />
                    <Select
                      value={negativeIsExpense ? 'expense' : 'income'}
                      onValueChange={(v) => setNegativeIsExpense((v ?? 'expense') === 'expense')}
                    >
                      <SelectTrigger className="bg-card h-auto w-full rounded-xl px-3 py-3 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Negative = expense</SelectItem>
                        <SelectItem value="income">Negative = income</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground mb-1 text-[11px]">Debit (money out)</p>
                      <ColumnSelect headers={parsed.headers} value={debitCol} onChange={setDebitCol} />
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 text-[11px]">Credit (money in)</p>
                      <ColumnSelect
                        headers={parsed.headers}
                        value={creditCol}
                        onChange={setCreditCol}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Note / description column (optional)
                </Label>
                <ColumnSelect
                  headers={parsed.headers}
                  value={noteCol}
                  onChange={setNoteCol}
                  allowNone
                />
              </div>

              <div>
                <Label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Category column (optional)
                </Label>
                <ColumnSelect
                  headers={parsed.headers}
                  value={categoryCol}
                  onChange={setCategoryCol}
                  allowNone
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Matched by name to your existing categories; unmatched rows import as
                  Miscellaneous.
                </p>
              </div>
            </div>

            <Button
              onClick={handlePreview}
              disabled={!canPreview}
              className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preview Import
            </Button>
          </div>
        )}

        {step === 'preview' && result && (
          <div className="space-y-4">
            <div className="card-elevated divide-border grid grid-cols-3 divide-x rounded-2xl text-center">
              <div className="p-3">
                <p className="text-lg font-bold">{result.totalRows}</p>
                <p className="text-muted-foreground text-[11px]">Rows in file</p>
              </div>
              <div className="p-3">
                <p className="text-lg font-bold">{result.accepted.length}</p>
                <p className="text-muted-foreground text-[11px]">Parsed OK</p>
              </div>
              <div className="p-3">
                <p className="text-lg font-bold">{duplicateRows.size}</p>
                <p className="text-muted-foreground text-[11px]">Possible duplicates</p>
              </div>
            </div>

            {duplicateRows.size > 0 && (
              <button
                onClick={() => setSkipDuplicates((v) => !v)}
                className="card-elevated flex w-full items-center justify-between rounded-2xl p-4"
              >
                <div className="text-left">
                  <p className="text-sm font-medium">Skip duplicate transactions</p>
                  <p className="text-muted-foreground text-xs">
                    Matched by same day, type, amount and note
                  </p>
                </div>
                <span
                  role="switch"
                  aria-checked={skipDuplicates}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    skipDuplicates ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                      skipDuplicates ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            )}

            {result.issues.length > 0 && (
              <div className="bg-muted/50 space-y-1.5 rounded-xl p-3">
                {result.issues.map((issue) => (
                  <p key={issue} className="flex gap-2 text-xs">
                    <AlertTriangle size={14} className="mt-px shrink-0 text-amber-500" />
                    <span className="text-muted-foreground">{issue}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="card-elevated divide-border divide-y overflow-hidden rounded-2xl">
              {result.accepted.slice(0, MAX_PREVIEW_ROWS).map((row) => {
                const isDup = duplicateRows.has(row.rowIndex);
                return (
                  <div
                    key={row.rowIndex}
                    className={`flex items-center gap-3 p-3 text-sm ${isDup && skipDuplicates ? 'opacity-40' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.transaction.note || '—'}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {formatFullDate(row.transaction.date)} · {categoryName(row.transaction.categoryId)}
                        {isDup && ' · Duplicate'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        row.transaction.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'
                      }`}
                    >
                      {row.transaction.type === 'expense' ? '-' : '+'}
                      {formatCurrency(row.transaction.amount)}
                    </span>
                  </div>
                );
              })}
              {result.accepted.length > MAX_PREVIEW_ROWS && (
                <p className="text-muted-foreground p-3 text-center text-xs">
                  …and {result.accepted.length - MAX_PREVIEW_ROWS} more, all will be imported
                </p>
              )}
              {result.accepted.length === 0 && (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  Nothing to import — check the column mapping
                </p>
              )}
            </div>

            <Button
              onClick={handleImport}
              disabled={importing || toImport.length === 0}
              className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${toImport.length} Transaction${toImport.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </Main>
    </>
  );
}

function ColumnSelect({
  headers,
  value,
  onChange,
  allowNone,
}: {
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger className="bg-card h-auto w-full rounded-xl px-3 py-3 text-xs">
        <SelectValue placeholder="Select column">
          {value === NONE ? 'None' : headers[Number(value)]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>None</SelectItem>}
        {headers.map((h, i) => (
          <SelectItem key={i} value={String(i)}>
            {h || `Column ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
