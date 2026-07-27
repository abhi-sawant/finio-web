import { addDays, addMonths, addWeeks, addYears, isAfter, parseISO } from 'date-fns';
import type { RecurringTransaction } from '@/types';

/** Safety cap on how many occurrences a single rule may generate in one pass. */
export const MAX_OCCURRENCES_PER_RULE = 365;

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

export interface PlannedOccurrence {
  rule: RecurringTransaction;
  date: Date;
}

export interface RecurringPlan {
  /** Due occurrences, in rule order then chronological order within a rule. */
  occurrences: PlannedOccurrence[];
  /** The rule list with `lastRunDate` advanced for anything generated. */
  rules: RecurringTransaction[];
  /** Rule ids that hit MAX_OCCURRENCES_PER_RULE and will continue on the next pass. */
  cappedRuleIds: string[];
}

/**
 * Pure planner for `processRecurring`: works out which occurrences are due without
 * touching the store. Rules whose account no longer exists are skipped.
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
    if (!accountIds.has(rule.accountId)) return rule;

    let next = rule.lastRunDate
      ? nextOccurrence(parseISO(rule.lastRunDate), rule.frequency)
      : parseISO(rule.startDate);
    if (Number.isNaN(next.getTime())) return rule;

    let lastRun: Date | null = null;
    let ruleGenerated = 0;

    // The cap is per rule: one long-overdue daily rule must not starve every other rule.
    while (!isAfter(next, now) && ruleGenerated < MAX_OCCURRENCES_PER_RULE) {
      occurrences.push({ rule, date: next });
      ruleGenerated += 1;
      lastRun = next;
      next = nextOccurrence(next, rule.frequency);
    }

    if (ruleGenerated === MAX_OCCURRENCES_PER_RULE && !isAfter(next, now)) {
      cappedRuleIds.push(rule.id);
    }

    return lastRun ? { ...rule, lastRunDate: lastRun.toISOString() } : rule;
  });

  return { occurrences, rules: nextRules, cappedRuleIds };
}
