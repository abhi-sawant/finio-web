import type {
  CategoryRule,
  RuleMatchType,
  Transaction,
  TransactionCategorization,
  TransactionType,
} from '@/types';

/**
 * Auto-categorization: "note contains Uber → Transport + Essential". Everything here is a pure
 * function of (rules, transaction-ish input) so the same engine backs manual add, CSV import and
 * a replay over existing history, and so it is testable without a store or a browser.
 *
 * Two invariants hold everywhere:
 * - **First match wins.** Array order is priority; disabled rules are skipped entirely.
 * - **Rules never touch a transfer or a split.** A transfer has no meaningful category, and a
 *   split is a deliberate per-category allocation that a note match has no business flattening.
 */

export const MATCH_TYPES: { value: RuleMatchType; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'equals', label: 'is exactly' },
  { value: 'regex', label: 'matches regex' },
];

export const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = MATCH_TYPES.reduce(
  (acc, { value, label }) => ({ ...acc, [value]: label }),
  {} as Record<RuleMatchType, string>,
);

/**
 * A user-typed regex can be syntactically invalid — and it is typed a character at a time, so
 * it is invalid most of the way to being finished. Never throw; the form uses this to show a
 * hint and the matcher treats an invalid pattern as matching nothing.
 */
export function isValidPattern(pattern: string, matchType: RuleMatchType): boolean {
  if (pattern.trim() === '') return false;
  if (matchType !== 'regex') return true;
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}

type Matcher = (note: string) => boolean;

/**
 * Compile a rule's pattern once. Replaying rules over thousands of transactions would otherwise
 * rebuild the same `RegExp` on every row.
 */
function compilePattern(pattern: string, matchType: RuleMatchType): Matcher {
  if (matchType === 'regex') {
    let re: RegExp;
    try {
      re = new RegExp(pattern, 'i');
    } catch {
      return () => false;
    }
    return (note) => re.test(note);
  }

  const needle = pattern.trim().toLowerCase();
  if (!needle) return () => false;

  switch (matchType) {
    case 'startsWith':
      return (note) => note.toLowerCase().startsWith(needle);
    case 'endsWith':
      return (note) => note.toLowerCase().endsWith(needle);
    case 'equals':
      return (note) => note.trim().toLowerCase() === needle;
    default:
      return (note) => note.toLowerCase().includes(needle);
  }
}

function scopeAllows(rule: CategoryRule, type: TransactionType): boolean {
  if (type === 'transfer') return false;
  return rule.scope === 'any' || rule.scope === type;
}

/** Whether a single rule fires for this note and transaction type. */
export function ruleMatches(rule: CategoryRule, note: string, type: TransactionType): boolean {
  if (!rule.enabled) return false;
  if (!scopeAllows(rule, type)) return false;
  return compilePattern(rule.pattern, rule.matchType)(note);
}

/** The first enabled rule that fires, or undefined. Convenience wrapper over `ruleMatches`. */
export function findMatchingRule(
  rules: CategoryRule[],
  note: string,
  type: TransactionType,
): CategoryRule | undefined {
  if (!note.trim()) return undefined;
  return rules.find((rule) => ruleMatches(rule, note, type));
}

/** A rule's labels are additive — it tags a transaction, it doesn't replace the user's tags. */
export function mergeLabels(existing: string[], ruleLabels: string[]): string[] {
  const next = [...existing];
  for (const id of ruleLabels) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export interface RuleApplication {
  transactionId: string;
  rule: CategoryRule;
  /** The row exactly as it is now, so the caller can undo the whole pass. */
  before: TransactionCategorization;
  after: TransactionCategorization;
}

export interface ReplayOptions {
  /**
   * Only rewrite transactions currently sitting in this category — the "just clean up the
   * Miscellaneous pile from my import" case, as opposed to re-filing everything.
   */
  restrictToCategoryId?: string;
}

/**
 * Work out what replaying the rules over existing history would change, without changing it.
 * Only rows that would actually move are returned, so the count is honest: a transaction whose
 * category and labels the winning rule already agrees with is not "changed".
 */
export function planRuleApplication(
  transactions: Transaction[],
  rules: CategoryRule[],
  options: ReplayOptions = {},
): RuleApplication[] {
  const active = rules.filter((r) => r.enabled && isValidPattern(r.pattern, r.matchType));
  if (active.length === 0) return [];

  // Compile once per rule rather than once per (rule, transaction) pair.
  const compiled = active.map((rule) => ({
    rule,
    matches: compilePattern(rule.pattern, rule.matchType),
  }));

  const applications: RuleApplication[] = [];

  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    if (t.splits && t.splits.length > 0) continue;
    if (!t.note.trim()) continue;
    if (
      options.restrictToCategoryId !== undefined &&
      t.categoryId !== options.restrictToCategoryId
    ) {
      continue;
    }

    const hit = compiled.find(({ rule, matches }) => scopeAllows(rule, t.type) && matches(t.note));
    if (!hit) continue;

    const labels = mergeLabels(t.labels, hit.rule.labelIds);
    const categoryChanged = t.categoryId !== hit.rule.categoryId;
    const labelsChanged = labels.length !== t.labels.length;
    if (!categoryChanged && !labelsChanged) continue;

    applications.push({
      transactionId: t.id,
      rule: hit.rule,
      before: { id: t.id, categoryId: t.categoryId, labels: t.labels, splits: t.splits },
      after: { id: t.id, categoryId: hit.rule.categoryId, labels, splits: t.splits },
    });
  }

  return applications;
}
