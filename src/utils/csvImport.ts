import Papa from 'papaparse';
import { findMatchingRule, mergeLabels } from './autoCategorize';
import type { Category, CategoryRule, Transaction } from '@/types';

/**
 * Bank CSV exports are free-form: unknown headers, unknown date format, and either a single
 * signed amount column or separate debit/credit columns. Everything here is a pure function of
 * (headers, rows, mapping) so the wizard UI can re-run it on every mapping tweak without
 * touching the store, and so it's testable without a browser.
 */

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
}

/** Thin wrapper around Papa.parse — handles quoted fields, embedded commas/newlines, and CRLF. */
export function parseCsvText(text: string, skipRows = 0): CsvParseResult {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const dataLines = result.data.slice(skipRows);
  const [headerRow, ...dataRows] = dataLines;
  return { headers: (headerRow ?? []).map((h) => h.trim()), rows: dataRows };
}

export type DateFormatCode =
  | 'YYYY-MM-DD'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD.MM.YYYY';

export const DATE_FORMATS: { value: DateFormatCode; label: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-07-27)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (27/07/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (07/27/2026)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (27-07-2026)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (07-27-2026)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (27.07.2026)' },
];

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Date normalizes out-of-range days (e.g. 31 Feb) instead of failing — catch that here.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString();
}

export function parseDateWithFormat(raw: string, format: DateFormatCode): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let m: RegExpMatchArray | null;
  switch (format) {
    case 'YYYY-MM-DD':
      m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      return m ? isoFromParts(+m[1], +m[2], +m[3]) : null;
    case 'DD/MM/YYYY':
      m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? isoFromParts(+m[3], +m[2], +m[1]) : null;
    case 'MM/DD/YYYY':
      m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? isoFromParts(+m[3], +m[1], +m[2]) : null;
    case 'DD-MM-YYYY':
      m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      return m ? isoFromParts(+m[3], +m[2], +m[1]) : null;
    case 'MM-DD-YYYY':
      m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      return m ? isoFromParts(+m[3], +m[1], +m[2]) : null;
    case 'DD.MM.YYYY':
      m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      return m ? isoFromParts(+m[3], +m[2], +m[1]) : null;
    default:
      return null;
  }
}

/** Tries formats most-unambiguous-first; returns the first one every sample agrees on. */
export function detectDateFormat(samples: string[]): DateFormatCode | undefined {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return undefined;
  return DATE_FORMATS.find(({ value }) =>
    nonEmpty.every((s) => parseDateWithFormat(s, value) !== null),
  )?.value;
}

/**
 * Strips currency symbols, thousand separators and whitespace. Accounting-style parentheses
 * (e.g. "(500.00)") are treated as negative, matching how many bank/card exports mark debits.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Drop currency words/abbreviations first — "Rs." would otherwise leave a stray decimal
  // point behind if only non-numeric characters were stripped in one pass.
  s = s.replace(/[A-Za-z]+\.?/g, '');
  s = s.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!s || s === '-' || s === '.') return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export type AmountMode = 'signed' | 'debitCredit';

export interface ColumnMapping {
  dateCol: number;
  noteCol?: number;
  categoryCol?: number;
  amountMode: AmountMode;
  /** Used when `amountMode === 'signed'`. */
  amountCol?: number;
  /** Whether a negative signed amount is an expense (true, the common convention) or income. */
  negativeIsExpense?: boolean;
  /** Used when `amountMode === 'debitCredit'`. */
  debitCol?: number;
  creditCol?: number;
}

export interface CsvImportOptions {
  mapping: ColumnMapping;
  dateFormat: DateFormatCode;
  accountId: string;
  categories: Category[];
  /** Category to fall back to when no category column is mapped, or its value matches nothing. */
  fallbackCategoryId: string;
  /**
   * Auto-categorization rules, in priority order. They fill the gap the statement leaves: a
   * rule only fires when the file's own category column didn't already say where the row goes,
   * so explicit data from the bank always outranks a guess from a note pattern.
   */
  rules?: CategoryRule[];
}

export interface ParsedCsvTransaction {
  /** Index into the original data rows (0-based) — lets the UI point back at the source row. */
  rowIndex: number;
  transaction: Omit<Transaction, 'id' | 'createdAt'>;
  /** False when a category column was mapped but its value didn't match any existing category. */
  categoryMatched: boolean;
  /** Set when an auto-categorization rule picked this row's category. */
  matchedRuleId?: string;
}

export interface CsvImportResult {
  accepted: ParsedCsvTransaction[];
  totalRows: number;
  /** Per-row rejection reasons, capped for display. */
  issues: string[];
}

const MAX_ISSUES = 8;

export function buildTransactionsFromCsv(
  rows: string[][],
  options: CsvImportOptions,
): CsvImportResult {
  const { mapping, dateFormat, accountId, categories, fallbackCategoryId, rules } = options;
  const accepted: ParsedCsvTransaction[] = [];
  const allIssues: string[] = [];

  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`;
    const rawDate = row[mapping.dateCol] ?? '';
    const date = parseDateWithFormat(rawDate, dateFormat);
    if (!date) {
      allIssues.push(`${rowLabel}: unparseable date "${rawDate}"`);
      return;
    }

    let amount: number;
    let type: 'expense' | 'income';

    if (mapping.amountMode === 'signed') {
      const raw = mapping.amountCol !== undefined ? (row[mapping.amountCol] ?? '') : '';
      const parsed = parseAmount(raw);
      if (parsed === null || parsed === 0) {
        allIssues.push(`${rowLabel}: unparseable amount "${raw}"`);
        return;
      }
      const negativeIsExpense = mapping.negativeIsExpense ?? true;
      const isExpense = negativeIsExpense ? parsed < 0 : parsed > 0;
      type = isExpense ? 'expense' : 'income';
      amount = Math.abs(parsed);
    } else {
      const rawDebit = mapping.debitCol !== undefined ? (row[mapping.debitCol] ?? '') : '';
      const rawCredit = mapping.creditCol !== undefined ? (row[mapping.creditCol] ?? '') : '';
      const debit = parseAmount(rawDebit) ?? 0;
      const credit = parseAmount(rawCredit) ?? 0;
      if (debit > 0 && credit > 0) {
        allIssues.push(`${rowLabel}: both debit and credit are filled`);
        return;
      }
      if (debit <= 0 && credit <= 0) {
        allIssues.push(`${rowLabel}: no debit or credit amount`);
        return;
      }
      type = debit > 0 ? 'expense' : 'income';
      amount = debit > 0 ? debit : credit;
    }

    const note = mapping.noteCol !== undefined ? (row[mapping.noteCol] ?? '').trim() : '';

    let categoryId = fallbackCategoryId;
    let categoryMatched = false;
    if (mapping.categoryCol !== undefined) {
      const rawCategory = (row[mapping.categoryCol] ?? '').trim();
      if (rawCategory) {
        const match = categories.find(
          (c) =>
            (c.type === type || c.type === 'both') &&
            c.name.toLowerCase() === rawCategory.toLowerCase(),
        );
        if (match) {
          categoryId = match.id;
          categoryMatched = true;
        }
      }
    }

    // The statement had nothing to say about this row's category — let the rules try.
    let labels: string[] = [];
    let matchedRuleId: string | undefined;
    if (!categoryMatched && rules?.length) {
      const rule = findMatchingRule(rules, note, type);
      if (rule) {
        categoryId = rule.categoryId;
        labels = mergeLabels(labels, rule.labelIds);
        matchedRuleId = rule.id;
      }
    }

    accepted.push({
      rowIndex: index,
      categoryMatched,
      ...(matchedRuleId ? { matchedRuleId } : {}),
      transaction: {
        type,
        amount,
        accountId,
        categoryId,
        date,
        note,
        labels,
      },
    });
  });

  const issues = allIssues.slice(0, MAX_ISSUES);
  if (allIssues.length > issues.length) {
    issues.push(`…and ${allIssues.length - issues.length} more`);
  }

  return { accepted, totalRows: rows.length, issues };
}

function dedupeKey(date: string, amount: number, note: string, type: string): string {
  return `${date.slice(0, 10)}|${type}|${amount.toFixed(2)}|${note.trim().toLowerCase()}`;
}

/**
 * Flags rows that look like they're already in the ledger — same day, type, amount and note —
 * whether that match is against existing transactions or another row earlier in this same file
 * (re-importing the same statement, or a bank listing a row twice).
 */
export function findDuplicateRows(
  candidates: ParsedCsvTransaction[],
  existing: Transaction[],
): Set<number> {
  const existingKeys = new Set(existing.map((t) => dedupeKey(t.date, t.amount, t.note, t.type)));
  const seenInBatch = new Set<string>();
  const duplicates = new Set<number>();

  for (const { rowIndex, transaction } of candidates) {
    const key = dedupeKey(transaction.date, transaction.amount, transaction.note, transaction.type);
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      duplicates.add(rowIndex);
    }
    seenInBatch.add(key);
  }

  return duplicates;
}
