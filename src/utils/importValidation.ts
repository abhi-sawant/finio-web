import { defaultSettings } from '@/data/defaultData';
import type {
  Budget,
  Category,
  ImportPayload,
  ImportedAccount,
  Label,
  RecurringTransaction,
  Settings,
  Transaction,
} from '@/types';

/**
 * Backup files are user-supplied and completely replace (or merge into) every row of a money
 * app, so nothing goes in unchecked. Rows that fail validation are dropped and counted rather
 * than silently poisoning balances; cross-entity problems that are recoverable (a transaction
 * pointing at an account that isn't in the file) are reported as warnings and kept.
 */

export type ImportEntity =
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'labels'
  | 'budgets'
  | 'recurring';

export const IMPORT_ENTITIES: ImportEntity[] = [
  'accounts',
  'transactions',
  'categories',
  'labels',
  'budgets',
  'recurring',
];

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  accounts: 'Accounts',
  transactions: 'Transactions',
  categories: 'Categories',
  labels: 'Labels',
  budgets: 'Budgets',
  recurring: 'Recurring rules',
};

export interface EntityReport {
  present: boolean;
  total: number;
  accepted: number;
  rejected: number;
}

export interface ImportReport {
  counts: Record<ImportEntity, EntityReport>;
  hasSettings: boolean;
  /** Per-row rejection reasons, capped for display. */
  issues: string[];
  /** Problems that don't drop data but the user should see before committing. */
  warnings: string[];
}

export interface ValidatedBackup {
  data: ImportPayload;
  report: ImportReport;
}

const MAX_REPORTED_ISSUES = 8;

const ACCOUNT_TYPES = new Set(['checking', 'savings', 'cash', 'credit', 'investment', 'wallet']);
const TRANSACTION_TYPES = new Set(['expense', 'income', 'transfer']);
const CATEGORY_TYPES = new Set(['expense', 'income', 'both']);
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'yearly']);
const THEMES = new Set(['dark', 'light', 'system']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A parser returns the sanitized row, or a string explaining why the row was dropped. */
type RowParser<T> = (row: Record<string, unknown>) => T | string;

const parseAccount: RowParser<ImportedAccount> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  const type = typeof row.type === 'string' && ACCOUNT_TYPES.has(row.type) ? row.type : undefined;
  if (!type) return `unknown account type "${String(row.type)}"`;
  const balance = asFiniteNumber(row.balance);
  if (balance === undefined) return 'balance is not a number';

  const openingBalance = asFiniteNumber(row.openingBalance);
  const creditLimit = asFiniteNumber(row.creditLimit);
  const archivedAt = asIsoDate(row.archivedAt);

  return {
    id,
    name,
    type: type as ImportedAccount['type'],
    color: asString(row.color, '#6C63FF'),
    icon: asString(row.icon, 'landmark'),
    balance,
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
    ...(openingBalance !== undefined ? { openingBalance } : {}),
    ...(creditLimit !== undefined ? { creditLimit } : {}),
    // An unparseable value just means "not archived" — never a reason to drop the account.
    ...(archivedAt ? { archivedAt } : {}),
  };
};

const parseTransaction: RowParser<Transaction> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const type =
    typeof row.type === 'string' && TRANSACTION_TYPES.has(row.type) ? row.type : undefined;
  if (!type) return `unknown transaction type "${String(row.type)}"`;
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount < 0) return 'negative amount';
  const accountId = asId(row.accountId);
  if (!accountId) return 'missing accountId';
  const date = asIsoDate(row.date);
  if (!date) return `unparseable date "${String(row.date)}"`;

  const toAccountId = asId(row.toAccountId);
  if (type === 'transfer' && !toAccountId) return 'transfer has no destination account';

  const recurringId = asId(row.recurringId);

  return {
    id,
    type: type as Transaction['type'],
    amount,
    accountId,
    categoryId: asString(row.categoryId, ''),
    date,
    note: asString(row.note, ''),
    labels: asStringArray(row.labels),
    createdAt: asIsoDate(row.createdAt) ?? date,
    ...(toAccountId ? { toAccountId } : {}),
    ...(recurringId ? { recurringId } : {}),
  };
};

const parseCategory: RowParser<Category> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  const type = typeof row.type === 'string' && CATEGORY_TYPES.has(row.type) ? row.type : undefined;
  if (!type) return `unknown category type "${String(row.type)}"`;
  return {
    id,
    name,
    icon: asString(row.icon, 'circle-ellipsis'),
    color: asString(row.color, '#94a3b8'),
    type: type as Category['type'],
  };
};

const parseLabel: RowParser<Label> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  return { id, name, color: asString(row.color, '#64748b') };
};

const parseBudget: RowParser<Budget> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  if (typeof row.categoryId !== 'string') return 'missing categoryId';
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount <= 0) return 'amount must be greater than zero';
  return {
    id,
    categoryId: row.categoryId,
    amount,
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
  };
};

const parseRecurring: RowParser<RecurringTransaction> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const type = row.type === 'expense' || row.type === 'income' ? row.type : undefined;
  if (!type) return `recurring rules cannot be "${String(row.type)}"`;
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount < 0) return 'negative amount';
  const accountId = asId(row.accountId);
  if (!accountId) return 'missing accountId';
  const frequency =
    typeof row.frequency === 'string' && FREQUENCIES.has(row.frequency) ? row.frequency : undefined;
  if (!frequency) return `unknown frequency "${String(row.frequency)}"`;
  const startDate = asIsoDate(row.startDate);
  if (!startDate) return `unparseable startDate "${String(row.startDate)}"`;

  return {
    id,
    type,
    amount,
    accountId,
    categoryId: asString(row.categoryId, ''),
    note: asString(row.note, ''),
    labels: asStringArray(row.labels),
    frequency: frequency as RecurringTransaction['frequency'],
    startDate,
    lastRunDate: asIsoDate(row.lastRunDate) ?? null,
    createdAt: asIsoDate(row.createdAt) ?? startDate,
  };
};

function parseSettings(value: unknown): Settings | undefined {
  if (!isRecord(value)) return undefined;
  // Pick only known keys — this is also what strips the legacy `currency` field.
  return {
    theme:
      typeof value.theme === 'string' && THEMES.has(value.theme)
        ? (value.theme as Settings['theme'])
        : defaultSettings.theme,
    userName: asId(value.userName) ?? defaultSettings.userName,
    autoLocalBackup:
      typeof value.autoLocalBackup === 'boolean'
        ? value.autoLocalBackup
        : defaultSettings.autoLocalBackup,
  };
}

interface CollectResult<T> {
  rows?: T[];
  report: EntityReport;
  issues: string[];
}

function collect<T extends { id: string }>(
  raw: unknown,
  entity: ImportEntity,
  parse: RowParser<T>,
): CollectResult<T> {
  const label = ENTITY_LABELS[entity];
  const report: EntityReport = { present: false, total: 0, accepted: 0, rejected: 0 };
  const issues: string[] = [];

  if (raw === undefined || raw === null) return { report, issues };
  if (!Array.isArray(raw)) {
    report.present = true;
    issues.push(`${label}: expected a list, ignoring it`);
    return { report, issues };
  }

  report.present = true;
  report.total = raw.length;

  const rows: T[] = [];
  const seen = new Set<string>();

  raw.forEach((row, index) => {
    if (!isRecord(row)) {
      report.rejected += 1;
      issues.push(`${label} #${index + 1}: not an object`);
      return;
    }
    const parsed = parse(row);
    if (typeof parsed === 'string') {
      report.rejected += 1;
      issues.push(`${label} #${index + 1}: ${parsed}`);
      return;
    }
    if (seen.has(parsed.id)) {
      report.rejected += 1;
      issues.push(`${label} #${index + 1}: duplicate id ${parsed.id}`);
      return;
    }
    seen.add(parsed.id);
    rows.push(parsed);
    report.accepted += 1;
  });

  return { rows, report, issues };
}

/**
 * Validate and sanitize a parsed backup object. Throws if the file carries nothing
 * importable at all; otherwise always returns data plus a report to preview.
 */
export function validateBackup(raw: unknown): ValidatedBackup {
  if (!isRecord(raw)) throw new Error('Not a Finio backup file');

  const accounts = collect(raw.accounts, 'accounts', parseAccount);
  const transactions = collect(raw.transactions, 'transactions', parseTransaction);
  const categories = collect(raw.categories, 'categories', parseCategory);
  const labels = collect(raw.labels, 'labels', parseLabel);
  const budgets = collect(raw.budgets, 'budgets', parseBudget);
  const recurring = collect(raw.recurring, 'recurring', parseRecurring);
  const settings = parseSettings(raw.settings);

  const counts: Record<ImportEntity, EntityReport> = {
    accounts: accounts.report,
    transactions: transactions.report,
    categories: categories.report,
    labels: labels.report,
    budgets: budgets.report,
    recurring: recurring.report,
  };

  const anyPresent = IMPORT_ENTITIES.some((e) => counts[e].present) || settings !== undefined;
  if (!anyPresent) throw new Error('Not a Finio backup file');

  const allIssues = [
    ...accounts.issues,
    ...transactions.issues,
    ...categories.issues,
    ...labels.issues,
    ...budgets.issues,
    ...recurring.issues,
  ];
  const issues = allIssues.slice(0, MAX_REPORTED_ISSUES);
  if (allIssues.length > issues.length) {
    issues.push(`…and ${allIssues.length - issues.length} more`);
  }

  // Referential checks. Only meaningful when the file actually carries the other side —
  // when merging, the missing row may already exist locally, so these stay warnings.
  const warnings: string[] = [];

  if (accounts.rows && transactions.rows) {
    const ids = new Set(accounts.rows.map((a) => a.id));
    const orphans = transactions.rows.filter(
      (t) => !ids.has(t.accountId) || (t.toAccountId ? !ids.has(t.toAccountId) : false),
    ).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} transaction${orphans === 1 ? '' : 's'} reference an account that is not in this file`,
      );
    }
  }

  if (accounts.rows && recurring.rows) {
    const ids = new Set(accounts.rows.map((a) => a.id));
    const orphans = recurring.rows.filter((r) => !ids.has(r.accountId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} recurring rule${orphans === 1 ? '' : 's'} reference an account that is not in this file — they will not generate transactions`,
      );
    }
  }

  if (categories.rows && budgets.rows) {
    const ids = new Set(categories.rows.map((c) => c.id));
    const orphans = budgets.rows.filter(
      (b) => b.categoryId !== '' && !ids.has(b.categoryId),
    ).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} budget${orphans === 1 ? '' : 's'} reference a category that is not in this file`,
      );
    }
  }

  const missingOpening = accounts.rows?.filter((a) => typeof a.openingBalance !== 'number').length;
  if (missingOpening) {
    warnings.push(
      `${missingOpening} account${missingOpening === 1 ? '' : 's'} have no opening balance — it will be derived from the imported transactions`,
    );
  }

  return {
    data: {
      ...(accounts.rows ? { accounts: accounts.rows } : {}),
      ...(transactions.rows ? { transactions: transactions.rows } : {}),
      ...(categories.rows ? { categories: categories.rows } : {}),
      ...(labels.rows ? { labels: labels.rows } : {}),
      ...(budgets.rows ? { budgets: budgets.rows } : {}),
      ...(recurring.rows ? { recurring: recurring.rows } : {}),
      ...(settings ? { settings } : {}),
    },
    report: { counts, hasSettings: settings !== undefined, issues, warnings },
  };
}
