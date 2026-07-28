/**
 * Pure decision logic for the app lock: when to re-lock on resume, and how long to make someone
 * wait after repeated wrong PINs. Everything here takes `now` explicitly so it is testable and
 * so the lock never depends on when a render happened to run.
 */

/** Auto-lock delays offered in Settings, in minutes. 0 means the moment the app is hidden. */
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 60] as const;

export const DEFAULT_AUTO_LOCK_MINUTES = 1;

/** Wrong PINs tolerated before any cooldown starts. */
export const FREE_ATTEMPTS = 4;

/** Cooldown ladder in ms, applied from the 5th failure onward; the last value is the cap. */
const PENALTY_LADDER_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

/**
 * Whether returning to a backgrounded app should demand the PIN again.
 *
 * Fails closed in every ambiguous case. The one that matters in practice: iOS does not reliably
 * fire `pagehide` when it terminates a backgrounded PWA, so a cold start often has no timestamp
 * at all. Locking then means some launches inside the grace window still ask for the PIN — the
 * right direction to be wrong in for a lock.
 */
export function shouldLockOnResume(args: {
  backgroundedAt: number | null;
  autoLockMinutes: number;
  now: number;
}): boolean {
  const { backgroundedAt, autoLockMinutes, now } = args;

  if (backgroundedAt === null || !Number.isFinite(backgroundedAt)) return true;
  // Clock moved backwards — do not hand out a free grace window for it.
  if (backgroundedAt > now) return true;
  if (autoLockMinutes <= 0) return true;

  return now - backgroundedAt >= autoLockMinutes * 60_000;
}

/** Cooldown in ms earned by `failedAttempts` consecutive wrong PINs. 0 below the threshold. */
export function penaltyForAttempts(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0;
  const index = Math.min(failedAttempts - FREE_ATTEMPTS - 1, PENALTY_LADDER_MS.length - 1);
  return PENALTY_LADDER_MS[index];
}

/** Epoch ms the pad becomes usable again, or null when no cooldown has been earned. */
export function nextLockoutUntil(failedAttempts: number, now: number): number | null {
  const penalty = penaltyForAttempts(failedAttempts);
  return penalty === 0 ? null : now + penalty;
}

export function remainingLockoutMs(lockedOutUntil: number | null, now: number): number {
  if (lockedOutUntil === null || !Number.isFinite(lockedOutUntil)) return 0;
  return Math.max(0, lockedOutUntil - now);
}

/** `m:ss`, rounded up so the countdown never shows 0:00 while the pad is still disabled. */
export function formatLockoutCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function autoLockLabel(minutes: number): string {
  if (minutes <= 0) return 'Immediately';
  if (minutes === 60) return 'After 1 hour';
  return `After ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
