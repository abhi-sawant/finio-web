import { describe, expect, it } from 'vitest';
import { MAX_OCCURRENCES_PER_RULE, nextOccurrence, planRecurring } from './recurring';
import type { RecurringTransaction } from '@/types';

function rule(
  partial: Partial<RecurringTransaction> & Pick<RecurringTransaction, 'id'>,
): RecurringTransaction {
  return {
    type: 'expense',
    amount: 100,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    note: '',
    labels: [],
    frequency: 'monthly',
    startDate: '2026-01-10T00:00:00.000Z',
    lastRunDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('nextOccurrence', () => {
  it('advances by the rule frequency', () => {
    const base = new Date('2026-03-10T00:00:00.000Z');
    expect(nextOccurrence(base, 'daily').toISOString()).toBe('2026-03-11T00:00:00.000Z');
    expect(nextOccurrence(base, 'weekly').toISOString()).toBe('2026-03-17T00:00:00.000Z');
    expect(nextOccurrence(base, 'monthly').toISOString()).toBe('2026-04-10T00:00:00.000Z');
    expect(nextOccurrence(base, 'yearly').toISOString()).toBe('2027-03-10T00:00:00.000Z');
  });
});

describe('planRecurring', () => {
  it('generates every due occurrence from startDate when never run', () => {
    const plan = planRecurring([rule({ id: 'r1' })], ['acc-1'], NOW);
    // Jan–Jun on the 10th.
    expect(plan.occurrences).toHaveLength(6);
    expect(plan.occurrences[0].date.toISOString()).toBe('2026-01-10T00:00:00.000Z');
    expect(plan.rules[0].lastRunDate).toBe('2026-06-10T00:00:00.000Z');
  });

  it('resumes from lastRunDate, not startDate', () => {
    const plan = planRecurring(
      [rule({ id: 'r1', lastRunDate: '2026-04-10T00:00:00.000Z' })],
      ['acc-1'],
      NOW,
    );
    expect(plan.occurrences.map((o) => o.date.toISOString())).toEqual([
      '2026-05-10T00:00:00.000Z',
      '2026-06-10T00:00:00.000Z',
    ]);
  });

  it('generates nothing for a rule that is not due yet', () => {
    const plan = planRecurring(
      [rule({ id: 'r1', startDate: '2026-08-01T00:00:00.000Z' })],
      ['acc-1'],
      NOW,
    );
    expect(plan.occurrences).toHaveLength(0);
    expect(plan.rules[0].lastRunDate).toBeNull();
  });

  it('skips rules whose account has been deleted', () => {
    const plan = planRecurring([rule({ id: 'r1', accountId: 'gone' })], ['acc-1'], NOW);
    expect(plan.occurrences).toHaveLength(0);
    expect(plan.rules[0].lastRunDate).toBeNull();
  });

  it('caps per rule, so a long-overdue daily rule cannot starve the others', () => {
    const plan = planRecurring(
      [
        // ~5 years of daily occurrences: far more than the cap on its own.
        rule({ id: 'daily', frequency: 'daily', startDate: '2021-01-01T00:00:00.000Z' }),
        rule({ id: 'monthly', startDate: '2026-04-10T00:00:00.000Z' }),
      ],
      ['acc-1'],
      NOW,
    );

    const daily = plan.occurrences.filter((o) => o.rule.id === 'daily');
    const monthly = plan.occurrences.filter((o) => o.rule.id === 'monthly');

    expect(daily).toHaveLength(MAX_OCCURRENCES_PER_RULE);
    // The second rule still gets its full catch-up (Apr, May, Jun) rather than one occurrence.
    expect(monthly).toHaveLength(3);
    expect(plan.cappedRuleIds).toEqual(['daily']);
  });

  it('leaves a rule untouched when its dates are unparseable', () => {
    const broken = rule({ id: 'r1', startDate: 'not-a-date' });
    const plan = planRecurring([broken], ['acc-1'], NOW);
    expect(plan.occurrences).toHaveLength(0);
    expect(plan.rules[0]).toBe(broken);
  });
});
