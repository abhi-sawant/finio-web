import { describe, expect, it } from 'vitest';
import {
  daysElapsedInPeriod,
  daysInPeriod,
  isWithinPeriod,
  monthPeriodStart,
  normalizeMonthStartDay,
  periodLabel,
  periodRange,
  periodShortLabel,
  shiftPeriod,
  yearPeriodStart,
} from './period';

/** Local-time construction throughout: period boundaries are local, not UTC. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('normalizeMonthStartDay', () => {
  it('defaults anything unusable to the 1st', () => {
    expect(normalizeMonthStartDay(undefined)).toBe(1);
    expect(normalizeMonthStartDay(null)).toBe(1);
    expect(normalizeMonthStartDay(Number.NaN)).toBe(1);
    expect(normalizeMonthStartDay('25')).toBe(1);
  });

  it('clamps to a day that exists in every month', () => {
    expect(normalizeMonthStartDay(0)).toBe(1);
    expect(normalizeMonthStartDay(31)).toBe(28);
    expect(normalizeMonthStartDay(25.7)).toBe(25);
  });
});

describe('monthPeriodStart', () => {
  it('is the calendar month with the default start day', () => {
    expect(monthPeriodStart(at(2026, 7, 27))).toEqual(at(2026, 7, 1, 0));
  });

  it('starts the cycle in the current month once the start day has passed', () => {
    expect(monthPeriodStart(at(2026, 7, 27), 25)).toEqual(at(2026, 7, 25, 0));
    expect(monthPeriodStart(at(2026, 7, 25, 0), 25)).toEqual(at(2026, 7, 25, 0));
  });

  it('reaches back into the previous month before the start day', () => {
    expect(monthPeriodStart(at(2026, 7, 24), 25)).toEqual(at(2026, 6, 25, 0));
  });

  it('crosses the year boundary', () => {
    expect(monthPeriodStart(at(2026, 1, 3), 25)).toEqual(at(2025, 12, 25, 0));
  });
});

describe('yearPeriodStart', () => {
  it('is January 1st by default', () => {
    expect(yearPeriodStart(at(2026, 7, 27))).toEqual(at(2026, 1, 1, 0));
  });

  it('anchors to the same day-of-month in January', () => {
    expect(yearPeriodStart(at(2026, 7, 27), 25)).toEqual(at(2026, 1, 25, 0));
    expect(yearPeriodStart(at(2026, 1, 5), 25)).toEqual(at(2025, 1, 25, 0));
  });
});

describe('periodRange', () => {
  it('ends one millisecond before the next period starts', () => {
    const range = periodRange('monthly', at(2026, 7, 10));
    expect(range.start).toEqual(at(2026, 7, 1, 0));
    expect(range.end).toEqual(new Date(at(2026, 8, 1, 0).getTime() - 1));
  });

  it('runs a weekly period Monday to Sunday', () => {
    // 27 Jul 2026 is a Monday.
    const range = periodRange('weekly', at(2026, 7, 30));
    expect(range.start).toEqual(at(2026, 7, 27, 0));
    expect(range.end).toEqual(new Date(at(2026, 8, 3, 0).getTime() - 1));
  });

  it('includes its boundaries and excludes its neighbours', () => {
    const range = periodRange('monthly', at(2026, 7, 10), 25);
    expect(isWithinPeriod(at(2026, 6, 25, 0), range)).toBe(true);
    expect(isWithinPeriod(at(2026, 7, 24, 23), range)).toBe(true);
    expect(isWithinPeriod(at(2026, 6, 24, 23), range)).toBe(false);
    expect(isWithinPeriod(at(2026, 7, 25, 0), range)).toBe(false);
  });
});

describe('shiftPeriod', () => {
  it('steps whole months back across a year boundary', () => {
    const january = periodRange('monthly', at(2026, 1, 10));
    expect(shiftPeriod(january, -1).start).toEqual(at(2025, 12, 1, 0));
  });

  it('keeps a custom start day anchored while stepping', () => {
    const current = periodRange('monthly', at(2026, 7, 27), 25);
    const previous = shiftPeriod(current, -1);
    expect(previous.start).toEqual(at(2026, 6, 25, 0));
    expect(previous.end).toEqual(new Date(current.start.getTime() - 1));
  });
});

describe('day counts', () => {
  it('counts the days a period spans', () => {
    expect(daysInPeriod(periodRange('monthly', at(2026, 2, 10)))).toBe(28);
    expect(daysInPeriod(periodRange('weekly', at(2026, 7, 30)))).toBe(7);
    // 10 Jul sits in the 25 Jun – 24 Jul cycle, which is 30 days long.
    expect(daysInPeriod(periodRange('monthly', at(2026, 7, 10), 25))).toBe(30);
  });

  it('counts today as elapsed and never exceeds the period', () => {
    const range = periodRange('monthly', at(2026, 7, 10));
    expect(daysElapsedInPeriod(range, at(2026, 7, 1))).toBe(1);
    expect(daysElapsedInPeriod(range, at(2026, 7, 10))).toBe(10);
    expect(daysElapsedInPeriod(range, at(2026, 9, 10))).toBe(31);
    expect(daysElapsedInPeriod(range, at(2026, 6, 10))).toBe(0);
  });
});

describe('periodLabel', () => {
  it('names a calendar month plainly', () => {
    expect(periodLabel(periodRange('monthly', at(2026, 7, 10)))).toBe('July 2026');
  });

  it('spells out the window when the cycle does not start on the 1st', () => {
    expect(periodLabel(periodRange('monthly', at(2026, 7, 27), 25), 25)).toBe(
      '25 Jul – 24 Aug 2026',
    );
  });

  it('labels weeks and years', () => {
    expect(periodLabel(periodRange('weekly', at(2026, 7, 30)))).toBe('27 Jul – 2 Aug');
    expect(periodLabel(periodRange('yearly', at(2026, 7, 30)))).toBe('2026');
    expect(periodShortLabel(periodRange('monthly', at(2026, 7, 30)))).toBe('Jul');
  });
});
