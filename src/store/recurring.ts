import { addDays, addMonths, addWeeks, addYears, isAfter, parseISO } from 'date-fns';
import type { RecurringTransaction } from '@/types';

/** Safety cap on how many occurrences a single rule may generate in one pass. */
export const MAX_OCCURRENCES_PER_RULE = 365;

/** Upper bound on the walk in `lastOccurrenceOnOrBefore` — ~55 years of a daily rule. */
const MAX_SCAN_STEPS = 20_000;

export function nextOccurrence(date: Date, freq: RecurringTransaction['frequency']): Date {
  switch (freq) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isRulePaused(rule: RecurringTransaction): boolean {
  return Boolean(rule.pausedAt);
}

/** How many occurrences the rule may still generate before hitting `maxOccurrences`. */
export function remainingOccurrences(rule: RecurringTransaction): number {
  if (rule.maxOccurrences === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, rule.maxOccurrences - rule.occurrenceCount);
}

/**
 * The next date this rule is scheduled to fire, or null when it never will again —
 * its occurrence count is used up, its end date has passed, or its dates don't parse.
 * Paused rules still report a date; pausing is a state the UI shows, not a schedule change.
 */
export function nextDueDate(rule: RecurringTransaction): Date | null {
  if (remainingOccurrences(rule) <= 0) return null;

  const last = parseDate(rule.lastRunDate);
  const next = last ? nextOccurrence(last, rule.frequency) : parseDate(rule.startDate);
  if (!next) return null;

  const end = parseDate(rule.endDate);
  if (end && isAfter(next, end)) return null;

  return next;
}

/** A rule that will never fire again — exhausted, ended, or with unusable dates. */
export function isRuleFinished(rule: RecurringTransaction): boolean {
  return nextDueDate(rule) === null;
}

/**
 * The most recent occurrence on or before `now`, following the rule's own cadence from its
 * start date. Used to start a rule "from today" without generating its history: the schedule
 * stays anchored to `startDate`, only the backfill is skipped.
 */
export function lastOccurrenceOnOrBefore(
  rule: Pick<RecurringTransaction, 'startDate' | 'frequency'>,
  now: Date,
): Date | null {
  const start = parseDate(rule.startDate);
  if (!start || isAfter(start, now)) return null;

  let last = start;
  for (let step = 0; step < MAX_SCAN_STEPS; step += 1) {
    const next = nextOccurrence(last, rule.frequency);
    if (isAfter(next, now)) return last;
    last = next;
  }
  return last;
}

export interface PlannedOccurrence {
  rule: RecurringTransaction;
  date: Date;
}

export interface RecurringPlan {
  /** Due occurrences, in rule order then chronological order within a rule. */
  occurrences: PlannedOccurrence[];
  /** The rule list with `lastRunDate` and `occurrenceCount` advanced for anything generated. */
  rules: RecurringTransaction[];
  /** Rule ids that hit MAX_OCCURRENCES_PER_RULE and will continue on the next pass. */
  cappedRuleIds: string[];
}

/**
 * Pure planner for `processRecurring`: works out which occurrences are due without
 * touching the store. Rules are skipped when paused, when their account (or a transfer's
 * destination account) no longer exists, past their end date, and once their occurrence
 * limit is used up.
 */
export function planRecurring(
  rules: RecurringTransaction[],
  knownAccountIds: Iterable<string>,
  now: Date,
): RecurringPlan {
  const accountIds = new Set(knownAccountIds);
  const occurrences: PlannedOccurrence[] = [];
  const cappedRuleIds: string[] = [];

  const nextRules = rules.map((rule) => {
    if (isRulePaused(rule)) return rule;
    if (!accountIds.has(rule.accountId)) return rule;
    if (rule.type === 'transfer' && (!rule.toAccountId || !accountIds.has(rule.toAccountId))) {
      return rule;
    }

    const allowance = Math.min(remainingOccurrences(rule), MAX_OCCURRENCES_PER_RULE);
    if (allowance <= 0) return rule;

    const last = parseDate(rule.lastRunDate);
    let next = last ? nextOccurrence(last, rule.frequency) : parseDate(rule.startDate);
    if (!next) return rule;

    const end = parseDate(rule.endDate);
    let lastRun: Date | null = null;
    let ruleGenerated = 0;

    // The cap is per rule: one long-overdue daily rule must not starve every other rule.
    while (!isAfter(next, now) && ruleGenerated < allowance && !(end && isAfter(next, end))) {
      occurrences.push({ rule, date: next });
      ruleGenerated += 1;
      lastRun = next;
      next = nextOccurrence(next, rule.frequency);
    }

    if (
      ruleGenerated === MAX_OCCURRENCES_PER_RULE &&
      !isAfter(next, now) &&
      !(end && isAfter(next, end))
    ) {
      cappedRuleIds.push(rule.id);
    }

    return lastRun
      ? {
          ...rule,
          lastRunDate: lastRun.toISOString(),
          occurrenceCount: rule.occurrenceCount + ruleGenerated,
        }
      : rule;
  });

  return { occurrences, rules: nextRules, cappedRuleIds };
}

/**
 * What creating (or editing) a rule would immediately generate. A rule dated in the past
 * injects transactions and moves balances, so the UI previews this before committing.
 */
export interface BackfillPreview {
  count: number;
  total: number;
  firstDate: Date | null;
  lastDate: Date | null;
  /** True when the cap was hit and a second pass would generate still more. */
  capped: boolean;
}

export function previewBackfill(
  rule: RecurringTransaction,
  knownAccountIds: Iterable<string>,
  now: Date,
): BackfillPreview {
  const plan = planRecurring([rule], knownAccountIds, now);
  const dates = plan.occurrences.map((o) => o.date);
  return {
    count: dates.length,
    total: dates.length * rule.amount,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    capped: plan.cappedRuleIds.length > 0,
  };
}
