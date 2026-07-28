import { describe, expect, it } from 'vitest';
import {
  MAX_NOTIFICATIONS_PER_RUN,
  selectDueNotifications,
  type ScheduledNotification,
} from './notifications';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;

function entry(partial: Partial<ScheduledNotification> & Pick<ScheduledNotification, 'id'>) {
  return {
    kind: 'bill' as const,
    fireAt: NOW - HOUR,
    expiresAt: NOW + HOUR,
    title: 'Bill due',
    body: '₹100',
    url: '/recurring',
    ...partial,
  };
}

describe('selectDueNotifications', () => {
  it('returns an entry whose fire time has passed and has not expired', () => {
    const due = selectDueNotifications([entry({ id: 'a' })], new Set(), NOW);
    expect(due.map((e) => e.id)).toEqual(['a']);
  });

  it('excludes an entry that has already been shown', () => {
    const due = selectDueNotifications([entry({ id: 'a' })], new Set(['a']), NOW);
    expect(due).toEqual([]);
  });

  it('excludes an entry that is not due yet', () => {
    const due = selectDueNotifications([entry({ id: 'a', fireAt: NOW + HOUR })], new Set(), NOW);
    expect(due).toEqual([]);
  });

  it('includes an entry due at exactly this moment', () => {
    const due = selectDueNotifications([entry({ id: 'a', fireAt: NOW })], new Set(), NOW);
    expect(due).toHaveLength(1);
  });

  it('excludes an expired entry, including one expiring at exactly this moment', () => {
    expect(
      selectDueNotifications([entry({ id: 'a', expiresAt: NOW - 1 })], new Set(), NOW),
    ).toEqual([]);
    expect(selectDueNotifications([entry({ id: 'a', expiresAt: NOW })], new Set(), NOW)).toEqual(
      [],
    );
  });

  it('returns the oldest reminder first', () => {
    const due = selectDueNotifications(
      [
        entry({ id: 'newer', fireAt: NOW - HOUR }),
        entry({ id: 'older', fireAt: NOW - 5 * HOUR }),
      ],
      new Set(),
      NOW,
    );
    expect(due.map((e) => e.id)).toEqual(['older', 'newer']);
  });

  it('caps how many fire at once, so returning after a month away is not a wall of banners', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `e${i}`, fireAt: NOW - (10 - i) * HOUR }),
    );
    expect(selectDueNotifications(many, new Set(), NOW)).toHaveLength(MAX_NOTIFICATIONS_PER_RUN);
  });
});
