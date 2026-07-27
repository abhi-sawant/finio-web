import { describe, expect, it } from 'vitest';
import {
  MAX_OCCURRENCES_PER_RULE,
  futureOccurrences,
  isRuleFinished,
  lastOccurrenceOnOrBefore,
  nextDueDate,
  nextOccurrence,
  planRecurring,
  previewBackfill,
} from './recurring';
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
    occurrenceCount: 0,
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

  it('counts what it generated so occurrence limits keep working across passes', () => {
    const plan = planRecurring([rule({ id: 'r1' })], ['acc-1'], NOW);
    expect(plan.rules[0].occurrenceCount).toBe(6);
  });
});

describe('rule lifecycle', () => {
  it('generates nothing while paused, and picks up again on resume', () => {
    const paused = rule({ id: 'r1', pausedAt: '2026-02-01T00:00:00.000Z' });
    expect(planRecurring([paused], ['acc-1'], NOW).occurrences).toHaveLength(0);

    const resumed = { ...paused };
    delete resumed.pausedAt;
    expect(planRecurring([resumed], ['acc-1'], NOW).occurrences).toHaveLength(6);
  });

  it('stops at the end date', () => {
    const plan = planRecurring(
      [rule({ id: 'r1', endDate: '2026-03-31T23:59:59.000Z' })],
      ['acc-1'],
      NOW,
    );
    expect(plan.occurrences.map((o) => o.date.toISOString())).toEqual([
      '2026-01-10T00:00:00.000Z',
      '2026-02-10T00:00:00.000Z',
      '2026-03-10T00:00:00.000Z',
    ]);
  });

  it('stops after the requested number of occurrences, across passes', () => {
    const first = planRecurring([rule({ id: 'r1', maxOccurrences: 2 })], ['acc-1'], NOW);
    expect(first.occurrences).toHaveLength(2);
    expect(first.rules[0].occurrenceCount).toBe(2);

    // A second pass on the already-exhausted rule must add nothing.
    const second = planRecurring(first.rules, ['acc-1'], NOW);
    expect(second.occurrences).toHaveLength(0);
  });

  it('generates transfers only when both accounts still exist', () => {
    const transfer = rule({ id: 'r1', type: 'transfer', toAccountId: 'acc-2' });
    expect(planRecurring([transfer], ['acc-1'], NOW).occurrences).toHaveLength(0);
    expect(planRecurring([transfer], ['acc-1', 'acc-2'], NOW).occurrences).toHaveLength(6);
  });

  it('rejects a transfer rule with no destination', () => {
    const broken = rule({ id: 'r1', type: 'transfer' });
    expect(planRecurring([broken], ['acc-1', 'acc-2'], NOW).occurrences).toHaveLength(0);
  });
});

describe('nextDueDate', () => {
  it('is the start date before the first run, then follows the cadence', () => {
    expect(nextDueDate(rule({ id: 'r1' }))?.toISOString()).toBe('2026-01-10T00:00:00.000Z');
    expect(
      nextDueDate(rule({ id: 'r1', lastRunDate: '2026-06-10T00:00:00.000Z' }))?.toISOString(),
    ).toBe('2026-07-10T00:00:00.000Z');
  });

  it('is null once the rule can never fire again', () => {
    const exhausted = rule({ id: 'r1', maxOccurrences: 2, occurrenceCount: 2 });
    const ended = rule({
      id: 'r2',
      lastRunDate: '2026-06-10T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
    });
    expect(nextDueDate(exhausted)).toBeNull();
    expect(isRuleFinished(exhausted)).toBe(true);
    expect(nextDueDate(ended)).toBeNull();
  });
});

describe('lastOccurrenceOnOrBefore', () => {
  it('parks the schedule on the most recent past occurrence', () => {
    expect(lastOccurrenceOnOrBefore(rule({ id: 'r1' }), NOW)?.toISOString()).toBe(
      '2026-06-10T00:00:00.000Z',
    );
  });

  it('is null for a rule that has not started yet', () => {
    expect(
      lastOccurrenceOnOrBefore(rule({ id: 'r1', startDate: '2026-08-01T00:00:00.000Z' }), NOW),
    ).toBeNull();
  });

  it('leaves nothing to backfill once applied', () => {
    const skipped = rule({
      id: 'r1',
      lastRunDate: lastOccurrenceOnOrBefore(rule({ id: 'r1' }), NOW)!.toISOString(),
    });
    expect(previewBackfill(skipped, ['acc-1'], NOW).count).toBe(0);
  });
});

describe('previewBackfill', () => {
  it('reports what saving the rule would immediately create', () => {
    const preview = previewBackfill(rule({ id: 'r1', amount: 250 }), ['acc-1'], NOW);
    expect(preview.count).toBe(6);
    expect(preview.total).toBe(1500);
    expect(preview.firstDate?.toISOString()).toBe('2026-01-10T00:00:00.000Z');
    expect(preview.lastDate?.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(preview.capped).toBe(false);
  });

  it('flags a backfill that will spill into the next pass', () => {
    const preview = previewBackfill(
      rule({ id: 'r1', frequency: 'daily', startDate: '2021-01-01T00:00:00.000Z' }),
      ['acc-1'],
      NOW,
    );
    expect(preview.count).toBe(MAX_OCCURRENCES_PER_RULE);
    expect(preview.capped).toBe(true);
  });
});

describe('futureOccurrences', () => {
  const horizon = new Date('2026-09-15T12:00:00.000Z');

  it('lists only the dates still ahead, never the overdue backlog', () => {
    // Started in January and never run: five occurrences are overdue, and those belong to
    // `planRecurring`, not to a forecast.
    const dates = futureOccurrences(rule({ id: 'r1' }), NOW, horizon);
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-07-10T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z',
    ]);
  });

  it('yields nothing for a paused rule', () => {
    expect(
      futureOccurrences(rule({ id: 'r1', pausedAt: '2026-05-01T00:00:00.000Z' }), NOW, horizon),
    ).toEqual([]);
  });

  it('stops at the end date', () => {
    const dates = futureOccurrences(
      rule({ id: 'r1', endDate: '2026-08-01T00:00:00.000Z' }),
      NOW,
      horizon,
    );
    expect(dates.map((d) => d.toISOString())).toEqual(['2026-07-10T00:00:00.000Z']);
  });

  it('counts the overdue backlog against the remaining occurrence limit', () => {
    // Ten allowed, six already due by now — only four are left, all of them in the future.
    const dates = futureOccurrences(
      rule({ id: 'r1', maxOccurrences: 10 }),
      NOW,
      new Date('2027-12-31T00:00:00.000Z'),
    );
    expect(dates).toHaveLength(4);
  });

  it('yields nothing once the rule is finished', () => {
    expect(
      futureOccurrences(rule({ id: 'r1', maxOccurrences: 2, occurrenceCount: 2 }), NOW, horizon),
    ).toEqual([]);
  });
});
