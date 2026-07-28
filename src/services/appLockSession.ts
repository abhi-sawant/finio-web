const BACKGROUNDED_AT_KEY = 'finio-lock-bg';

/**
 * When the app was last backgrounded.
 *
 * localStorage rather than sessionStorage or React state, and the choice matters. React state
 * dies on a page kill. sessionStorage is per-tab and is discarded when iOS evicts a backgrounded
 * PWA — which would make every cold launch look like "no timestamp", and `shouldLockOnResume`
 * fails closed, so the user would be asked for their PIN every single time even with a
 * 15-minute grace set.
 *
 * Kept out of `utils/appLock.ts` so that module stays pure, and out of the hook so the lock
 * store's `onRehydrateStorage` can read it while deciding whether to start locked.
 */

export function writeBackgroundedAt(at: number): void {
  try {
    localStorage.setItem(BACKGROUNDED_AT_KEY, String(at));
  } catch {
    /* storage full or blocked — the missing timestamp fails closed, which is the safe side */
  }
}

export function readBackgroundedAt(): number | null {
  try {
    const raw = localStorage.getItem(BACKGROUNDED_AT_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBackgroundedAt(): void {
  try {
    localStorage.removeItem(BACKGROUNDED_AT_KEY);
  } catch {
    /* nothing to clear */
  }
}
