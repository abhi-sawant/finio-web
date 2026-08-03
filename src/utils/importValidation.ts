import { defaultSettings } from '@/data/defaultData';
import { isValidPattern } from './autoCategorize';
import { MAX_NOTIFY_LEAD_DAYS } from './notifications';
import { normalizeMonthStartDay } from './period';
import type {
  Budget,
  Category,
  CategoryRule,
  DebtEntry,
  Goal,
  GoalContribution,
  ImportPayload,
  ImportedAccount,
  Label,
  Loan,
  LoanPrepayment,
  NetWorthSnapshot,
  Person,
  RecurringTransaction,
  Settings,
  Transaction,
  TransactionSplit,
  TransactionTemplate,
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
  | 'recurring'
  | 'templates'
  | 'rules'
  | 'goals'
  | 'goalContributions'
  | 'people'
  | 'debtEntries'
  | 'netWorthSnapshots'
  | 'loans'
  | 'loanPrepayments';

export const IMPORT_ENTITIES: ImportEntity[] = [
  'accounts',
  'transactions',
  'categories',
  'labels',
  'budgets',
  'recurring',
  'templates',
  'rules',
  'goals',
  'goalContributions',
  'people',
  'debtEntries',
  'netWorthSnapshots',
  'loans',
  'loanPrepayments',
];

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  accounts: 'Accounts',
  transactions: 'Transactions',
  categories: 'Categories',
  labels: 'Labels',
  budgets: 'Budgets',
  recurring: 'Recurring rules',
  templates: 'Templates',
  rules: 'Categorization rules',
  goals: 'Savings goals',
  goalContributions: 'Goal contributions',
  people: 'People',
  debtEntries: 'Debt entries',
  netWorthSnapshots: 'Net worth snapshots',
  loans: 'Loans',
  loanPrepayments: 'Loan prepayments',
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
const BUDGET_PERIODS = new Set(['weekly', 'monthly', 'yearly']);
const MATCH_TYPES = new Set(['contains', 'startsWith', 'endsWith', 'equals', 'regex']);
const RULE_SCOPES = new Set(['expense', 'income', 'any']);
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

/**
 * Splits are only kept when the shape is right and they add up — a malformed or
 * mismatched-sum split isn't a reason to drop the whole transaction, it's just not usable as a
 * split, so it silently falls back to the transaction's own `categoryId`.
 */
function asSplits(value: unknown, amount: number): TransactionSplit[] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const splits: TransactionSplit[] = [];
  for (const row of value) {
    if (!isRecord(row)) return undefined;
    const categoryId = asId(row.categoryId);
    const splitAmount = asFiniteNumber(row.amount);
    if (!categoryId || splitAmount === undefined || splitAmount <= 0) return undefined;
    splits.push({ categoryId, amount: splitAmount });
  }
  const total = splits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(total - amount) > 0.01) return undefined;
  return splits;
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
  const splits = type === 'expense' ? asSplits(row.splits, amount) : undefined;

  return {
    id,
    type: type as Transaction['type'],
    amount,
    accountId,
    categoryId: splits ? '' : asString(row.categoryId, ''),
    date,
    note: asString(row.note, ''),
    labels: asStringArray(row.labels),
    createdAt: asIsoDate(row.createdAt) ?? date,
    ...(toAccountId ? { toAccountId } : {}),
    ...(recurringId ? { recurringId } : {}),
    ...(splits ? { splits } : {}),
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

  const labelId = asId(row.labelId);

  return {
    id,
    categoryId: row.categoryId,
    amount,
    // Pre-v7 backups have neither field; both defaults reproduce the old behaviour exactly.
    period:
      typeof row.period === 'string' && BUDGET_PERIODS.has(row.period)
        ? (row.period as Budget['period'])
        : 'monthly',
    rollover: row.rollover === true,
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
    ...(labelId ? { labelId } : {}),
  };
};

const parseRecurring: RowParser<RecurringTransaction> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const type =
    typeof row.type === 'string' && TRANSACTION_TYPES.has(row.type) ? row.type : undefined;
  if (!type) return `unknown recurring type "${String(row.type)}"`;
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

  const toAccountId = asId(row.toAccountId);
  if (type === 'transfer' && !toAccountId) return 'transfer rule has no destination account';

  const endDate = asIsoDate(row.endDate);
  const maxRaw = asFiniteNumber(row.maxOccurrences);
  const maxOccurrences = maxRaw !== undefined && maxRaw >= 1 ? Math.trunc(maxRaw) : undefined;
  const occurrenceRaw = asFiniteNumber(row.occurrenceCount);
  const pausedAt = asIsoDate(row.pausedAt);

  return {
    id,
    type: type as RecurringTransaction['type'],
    amount,
    accountId,
    categoryId: asString(row.categoryId, ''),
    note: asString(row.note, ''),
    labels: asStringArray(row.labels),
    frequency: frequency as RecurringTransaction['frequency'],
    startDate,
    // Pre-v7 backups carry none of the lifecycle fields — the defaults mean "runs forever".
    occurrenceCount:
      occurrenceRaw !== undefined && occurrenceRaw > 0 ? Math.trunc(occurrenceRaw) : 0,
    lastRunDate: asIsoDate(row.lastRunDate) ?? null,
    createdAt: asIsoDate(row.createdAt) ?? startDate,
    ...(toAccountId && type === 'transfer' ? { toAccountId } : {}),
    ...(endDate ? { endDate } : {}),
    ...(maxOccurrences !== undefined ? { maxOccurrences } : {}),
    ...(pausedAt ? { pausedAt } : {}),
  };
};

const parseTemplate: RowParser<TransactionTemplate> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  const type =
    typeof row.type === 'string' && TRANSACTION_TYPES.has(row.type) ? row.type : undefined;
  if (!type) return `unknown template type "${String(row.type)}"`;
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount < 0) return 'negative amount';
  const accountId = asId(row.accountId);
  if (!accountId) return 'missing accountId';

  const toAccountId = asId(row.toAccountId);
  if (type === 'transfer' && !toAccountId) return 'transfer template has no destination account';

  const splits = type === 'expense' ? asSplits(row.splits, amount) : undefined;

  return {
    id,
    name,
    type: type as TransactionTemplate['type'],
    amount,
    accountId,
    categoryId: splits ? '' : asString(row.categoryId, ''),
    note: asString(row.note, ''),
    labels: asStringArray(row.labels),
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
    ...(toAccountId && type === 'transfer' ? { toAccountId } : {}),
    ...(splits ? { splits } : {}),
  };
};

const parseRule: RowParser<CategoryRule> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const pattern = asId(row.pattern);
  if (!pattern) return 'missing pattern';
  const matchType =
    typeof row.matchType === 'string' && MATCH_TYPES.has(row.matchType) ? row.matchType : undefined;
  if (!matchType) return `unknown match type "${String(row.matchType)}"`;
  // A rule that files nowhere is not recoverable the way a stray label is — drop it.
  const categoryId = asId(row.categoryId);
  if (!categoryId) return 'missing categoryId';
  // An unparseable regex would silently match nothing on every transaction forever.
  if (matchType === 'regex' && !isValidPattern(pattern, 'regex')) {
    return `invalid regex "${pattern}"`;
  }

  return {
    id,
    pattern,
    matchType: matchType as CategoryRule['matchType'],
    scope:
      typeof row.scope === 'string' && RULE_SCOPES.has(row.scope)
        ? (row.scope as CategoryRule['scope'])
        : 'any',
    categoryId,
    labelIds: asStringArray(row.labelIds),
    // Anything but an explicit `false` stays on — a rule in a backup was presumably wanted.
    enabled: row.enabled !== false,
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
  };
};

const parseGoal: RowParser<Goal> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  const targetAmount = asFiniteNumber(row.targetAmount);
  if (targetAmount === undefined) return 'targetAmount is not a number';
  if (targetAmount <= 0) return 'targetAmount must be greater than zero';

  const targetDate = asIsoDate(row.targetDate);
  const linkedAccountId = asId(row.linkedAccountId);

  return {
    id,
    name,
    icon: asString(row.icon, 'target'),
    color: asString(row.color, '#6C63FF'),
    targetAmount,
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
    ...(targetDate ? { targetDate } : {}),
    ...(linkedAccountId ? { linkedAccountId } : {}),
  };
};

const parseGoalContribution: RowParser<GoalContribution> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const goalId = asId(row.goalId);
  if (!goalId) return 'missing goalId';
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount === 0) return 'amount cannot be zero';
  const date = asIsoDate(row.date);
  if (!date) return `unparseable date "${String(row.date)}"`;

  return {
    id,
    goalId,
    amount,
    date,
    note: asString(row.note, ''),
    createdAt: asIsoDate(row.createdAt) ?? date,
  };
};

const parsePerson: RowParser<Person> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';

  return {
    id,
    name,
    icon: asString(row.icon, 'user'),
    color: asString(row.color, '#6C63FF'),
    createdAt: asIsoDate(row.createdAt) ?? new Date().toISOString(),
  };
};

const parseDebtEntry: RowParser<DebtEntry> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const personId = asId(row.personId);
  if (!personId) return 'missing personId';
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined) return 'amount is not a number';
  if (amount === 0) return 'amount cannot be zero';
  const date = asIsoDate(row.date);
  if (!date) return `unparseable date "${String(row.date)}"`;

  const settledTransactionId = asId(row.settledTransactionId);

  return {
    id,
    personId,
    amount,
    date,
    note: asString(row.note, ''),
    createdAt: asIsoDate(row.createdAt) ?? date,
    ...(settledTransactionId ? { settledTransactionId } : {}),
  };
};

const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const parseNetWorthSnapshot: RowParser<NetWorthSnapshot> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  // The period key is the snapshot's real identity — a malformed one would land the point on
  // the wrong month of the trend, which is worse than not having it at all.
  const periodKey = asId(row.periodKey);
  if (!periodKey || !PERIOD_KEY.test(periodKey)) {
    return `unparseable period key "${String(row.periodKey)}"`;
  }
  const date = asIsoDate(row.date);
  if (!date) return `unparseable date "${String(row.date)}"`;
  const assets = asFiniteNumber(row.assets);
  if (assets === undefined) return 'assets is not a number';
  const liabilities = asFiniteNumber(row.liabilities);
  if (liabilities === undefined) return 'liabilities is not a number';

  return {
    id,
    periodKey,
    date,
    assets,
    liabilities,
    createdAt: asIsoDate(row.createdAt) ?? date,
  };
};

const parseLoan: RowParser<Loan> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const name = asId(row.name);
  if (!name) return 'missing name';
  const principal = asFiniteNumber(row.principal);
  if (principal === undefined || principal <= 0) return 'principal must be greater than zero';
  const interestRate = asFiniteNumber(row.interestRate);
  if (interestRate === undefined || interestRate < 0) return 'interestRate is not a number';
  const tenureMonths = asFiniteNumber(row.tenureMonths);
  if (tenureMonths === undefined || tenureMonths <= 0) {
    return 'tenureMonths must be greater than zero';
  }
  const startDate = asIsoDate(row.startDate);
  if (!startDate) return `unparseable startDate "${String(row.startDate)}"`;
  const accountId = asId(row.accountId);
  if (!accountId) return 'missing accountId';
  const categoryId = asId(row.categoryId);
  if (!categoryId) return 'missing categoryId';

  const recurringId = asId(row.recurringId);
  const closedAt = asIsoDate(row.closedAt);

  return {
    id,
    name,
    principal,
    interestRate,
    tenureMonths: Math.trunc(tenureMonths),
    startDate,
    accountId,
    categoryId,
    createdAt: asIsoDate(row.createdAt) ?? startDate,
    ...(recurringId ? { recurringId } : {}),
    ...(closedAt ? { closedAt } : {}),
  };
};

const parseLoanPrepayment: RowParser<LoanPrepayment> = (row) => {
  const id = asId(row.id);
  if (!id) return 'missing id';
  const loanId = asId(row.loanId);
  if (!loanId) return 'missing loanId';
  const amount = asFiniteNumber(row.amount);
  if (amount === undefined || amount <= 0) return 'amount must be greater than zero';
  const date = asIsoDate(row.date);
  if (!date) return `unparseable date "${String(row.date)}"`;

  const transactionId = asId(row.transactionId);

  return {
    id,
    loanId,
    amount,
    date,
    note: asString(row.note, ''),
    createdAt: asIsoDate(row.createdAt) ?? date,
    ...(transactionId ? { transactionId } : {}),
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
    monthStartDay: normalizeMonthStartDay(value.monthStartDay),
    hideAmounts:
      typeof value.hideAmounts === 'boolean' ? value.hideAmounts : defaultSettings.hideAmounts,
    // A backup from a device that had reminders on is harmless to carry: nothing fires unless
    // this device also holds notification permission, which is checked at run time.
    notificationsEnabled:
      typeof value.notificationsEnabled === 'boolean'
        ? value.notificationsEnabled
        : defaultSettings.notificationsEnabled,
    notifyBills:
      typeof value.notifyBills === 'boolean' ? value.notifyBills : defaultSettings.notifyBills,
    notifyBudgets:
      typeof value.notifyBudgets === 'boolean'
        ? value.notifyBudgets
        : defaultSettings.notifyBudgets,
    notifyCreditDue:
      typeof value.notifyCreditDue === 'boolean'
        ? value.notifyCreditDue
        : defaultSettings.notifyCreditDue,
    notifyLeadDays:
      typeof value.notifyLeadDays === 'number' && Number.isFinite(value.notifyLeadDays)
        ? Math.min(MAX_NOTIFY_LEAD_DAYS, Math.max(0, Math.trunc(value.notifyLeadDays)))
        : defaultSettings.notifyLeadDays,
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
  const templates = collect(raw.templates, 'templates', parseTemplate);
  const rules = collect(raw.rules, 'rules', parseRule);
  const goals = collect(raw.goals, 'goals', parseGoal);
  const goalContributions = collect(
    raw.goalContributions,
    'goalContributions',
    parseGoalContribution,
  );
  const people = collect(raw.people, 'people', parsePerson);
  const debtEntries = collect(raw.debtEntries, 'debtEntries', parseDebtEntry);
  const netWorthSnapshots = collect(
    raw.netWorthSnapshots,
    'netWorthSnapshots',
    parseNetWorthSnapshot,
  );
  const loans = collect(raw.loans, 'loans', parseLoan);
  const loanPrepayments = collect(raw.loanPrepayments, 'loanPrepayments', parseLoanPrepayment);
  const settings = parseSettings(raw.settings);

  const counts: Record<ImportEntity, EntityReport> = {
    accounts: accounts.report,
    transactions: transactions.report,
    categories: categories.report,
    labels: labels.report,
    budgets: budgets.report,
    recurring: recurring.report,
    templates: templates.report,
    rules: rules.report,
    goals: goals.report,
    goalContributions: goalContributions.report,
    people: people.report,
    debtEntries: debtEntries.report,
    netWorthSnapshots: netWorthSnapshots.report,
    loans: loans.report,
    loanPrepayments: loanPrepayments.report,
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
    ...templates.issues,
    ...rules.issues,
    ...goals.issues,
    ...goalContributions.issues,
    ...people.issues,
    ...debtEntries.issues,
    ...netWorthSnapshots.issues,
    ...loans.issues,
    ...loanPrepayments.issues,
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
    const orphans = recurring.rows.filter(
      (r) => !ids.has(r.accountId) || (r.toAccountId ? !ids.has(r.toAccountId) : false),
    ).length;
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

  if (categories.rows && rules.rows) {
    const ids = new Set(categories.rows.map((c) => c.id));
    const orphans = rules.rows.filter((r) => !ids.has(r.categoryId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} categorization rule${orphans === 1 ? '' : 's'} reference a category that is not in this file`,
      );
    }
  }

  if (labels.rows && budgets.rows) {
    const ids = new Set(labels.rows.map((l) => l.id));
    const orphans = budgets.rows.filter((b) => b.labelId && !ids.has(b.labelId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} budget${orphans === 1 ? '' : 's'} reference a label that is not in this file`,
      );
    }
  }

  const missingOpening = accounts.rows?.filter((a) => typeof a.openingBalance !== 'number').length;
  if (missingOpening) {
    warnings.push(
      `${missingOpening} account${missingOpening === 1 ? '' : 's'} have no opening balance — it will be derived from the imported transactions`,
    );
  }

  if (goals.rows && goalContributions.rows) {
    const ids = new Set(goals.rows.map((g) => g.id));
    const orphans = goalContributions.rows.filter((c) => !ids.has(c.goalId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} goal contribution${orphans === 1 ? '' : 's'} reference a goal that is not in this file`,
      );
    }
  }

  if (people.rows && debtEntries.rows) {
    const ids = new Set(people.rows.map((p) => p.id));
    const orphans = debtEntries.rows.filter((e) => !ids.has(e.personId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} debt entr${orphans === 1 ? 'y' : 'ies'} reference a person that is not in this file`,
      );
    }
  }

  if (accounts.rows && loans.rows) {
    const ids = new Set(accounts.rows.map((a) => a.id));
    const orphans = loans.rows.filter((l) => !ids.has(l.accountId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} loan${orphans === 1 ? '' : 's'} reference an account that is not in this file`,
      );
    }
  }

  if (categories.rows && loans.rows) {
    const ids = new Set(categories.rows.map((c) => c.id));
    const orphans = loans.rows.filter((l) => !ids.has(l.categoryId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} loan${orphans === 1 ? '' : 's'} reference a category that is not in this file`,
      );
    }
  }

  if (loans.rows && loanPrepayments.rows) {
    const ids = new Set(loans.rows.map((l) => l.id));
    const orphans = loanPrepayments.rows.filter((p) => !ids.has(p.loanId)).length;
    if (orphans > 0) {
      warnings.push(
        `${orphans} loan prepayment${orphans === 1 ? '' : 's'} reference a loan that is not in this file`,
      );
    }
  }

  return {
    data: {
      ...(accounts.rows ? { accounts: accounts.rows } : {}),
      ...(transactions.rows ? { transactions: transactions.rows } : {}),
      ...(categories.rows ? { categories: categories.rows } : {}),
      ...(labels.rows ? { labels: labels.rows } : {}),
      ...(budgets.rows ? { budgets: budgets.rows } : {}),
      ...(recurring.rows ? { recurring: recurring.rows } : {}),
      ...(templates.rows ? { templates: templates.rows } : {}),
      ...(rules.rows ? { rules: rules.rows } : {}),
      ...(goals.rows ? { goals: goals.rows } : {}),
      ...(goalContributions.rows ? { goalContributions: goalContributions.rows } : {}),
      ...(people.rows ? { people: people.rows } : {}),
      ...(debtEntries.rows ? { debtEntries: debtEntries.rows } : {}),
      ...(netWorthSnapshots.rows ? { netWorthSnapshots: netWorthSnapshots.rows } : {}),
      ...(loans.rows ? { loans: loans.rows } : {}),
      ...(loanPrepayments.rows ? { loanPrepayments: loanPrepayments.rows } : {}),
      ...(settings ? { settings } : {}),
    },
    report: { counts, hasSettings: settings !== undefined, issues, warnings },
  };
}
