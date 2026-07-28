import { describe, expect, it } from 'vitest';
import {
  autoLockLabel,
  formatLockoutCountdown,
  nextLockoutUntil,
  penaltyForAttempts,
  remainingLockoutMs,
  shouldLockOnResume,
} from './appLock';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
const MINUTE = 60_000;

describe('shouldLockOnResume', () => {
  it('locks when there is no timestamp at all', () => {
    // iOS does not reliably fire pagehide when it kills a backgrounded PWA, so a cold start
    // often leaves no trace. Failing closed is the right direction to be wrong in.
    expect(shouldLockOnResume({ backgroundedAt: null, autoLockMinutes: 15, now: NOW })).toBe(true);
  });

  it('locks when the stored timestamp is not a finite number', () => {
    expect(shouldLockOnResume({ backgroundedAt: NaN, autoLockMinutes: 15, now: NOW })).toBe(true);
    expect(shouldLockOnResume({ backgroundedAt: Infinity, autoLockMinutes: 15, now: NOW })).toBe(
      true,
    );
  });

  it('locks when the clock has moved backwards', () => {
    expect(
      shouldLockOnResume({ backgroundedAt: NOW + MINUTE, autoLockMinutes: 15, now: NOW }),
    ).toBe(true);
  });

  it('locks immediately when the delay is zero', () => {
    expect(shouldLockOnResume({ backgroundedAt: NOW, autoLockMinutes: 0, now: NOW })).toBe(true);
  });

  it('stays unlocked inside the grace window', () => {
    expect(
      shouldLockOnResume({
        backgroundedAt: NOW - (5 * MINUTE - 1000),
        autoLockMinutes: 5,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('locks at exactly the threshold and beyond', () => {
    expect(
      shouldLockOnResume({ backgroundedAt: NOW - 5 * MINUTE, autoLockMinutes: 5, now: NOW }),
    ).toBe(true);
    expect(
      shouldLockOnResume({ backgroundedAt: NOW - 6 * MINUTE, autoLockMinutes: 5, now: NOW }),
    ).toBe(true);
  });
});

describe('penaltyForAttempts', () => {
  it('tolerates the first four wrong PINs with no cooldown', () => {
    for (let i = 0; i <= 4; i += 1) expect(penaltyForAttempts(i)).toBe(0);
  });

  it('starts at 15 seconds on the fifth', () => {
    expect(penaltyForAttempts(5)).toBe(15_000);
  });

  it('never decreases as attempts pile up', () => {
    let previous = 0;
    for (let i = 5; i <= 20; i += 1) {
      const penalty = penaltyForAttempts(i);
      expect(penalty).toBeGreaterThanOrEqual(previous);
      previous = penalty;
    }
  });

  it('caps rather than growing forever', () => {
    expect(penaltyForAttempts(20)).toBe(300_000);
    expect(penaltyForAttempts(500)).toBe(300_000);
  });
});

describe('nextLockoutUntil', () => {
  it('is null below the threshold', () => {
    expect(nextLockoutUntil(3, NOW)).toBeNull();
  });

  it('is now plus the penalty once earned', () => {
    expect(nextLockoutUntil(5, NOW)).toBe(NOW + 15_000);
  });
});

describe('remainingLockoutMs', () => {
  it('is zero when there is no cooldown', () => {
    expect(remainingLockoutMs(null, NOW)).toBe(0);
  });

  it('is zero once the deadline has passed', () => {
    expect(remainingLockoutMs(NOW - 1000, NOW)).toBe(0);
  });

  it('is the exact remaining time for a future deadline', () => {
    expect(remainingLockoutMs(NOW + 14_200, NOW)).toBe(14_200);
  });
});

describe('formatLockoutCountdown', () => {
  it('rounds up, so it never reads 0:00 while the pad is still disabled', () => {
    expect(formatLockoutCountdown(14_200)).toBe('0:15');
    expect(formatLockoutCountdown(1)).toBe('0:01');
  });

  it('formats whole minutes', () => {
    expect(formatLockoutCountdown(60_000)).toBe('1:00');
    expect(formatLockoutCountdown(300_000)).toBe('5:00');
  });

  it('formats zero', () => {
    expect(formatLockoutCountdown(0)).toBe('0:00');
  });
});

describe('autoLockLabel', () => {
  it('names each option the way the setting reads', () => {
    expect(autoLockLabel(0)).toBe('Immediately');
    expect(autoLockLabel(1)).toBe('After 1 minute');
    expect(autoLockLabel(5)).toBe('After 5 minutes');
    expect(autoLockLabel(60)).toBe('After 1 hour');
  });
});
