import { useEffect } from 'react';
import { useAppLockStore } from '@/store/useAppLockStore';
import {
  clearBackgroundedAt,
  readBackgroundedAt,
  writeBackgroundedAt,
} from '@/services/appLockSession';
import { shouldLockOnResume } from '@/utils/appLock';

/**
 * Re-locks the app after it has been backgrounded for long enough.
 *
 * Call this from `App()`, *not* from `AppRoutes` — `AppRoutes` sits inside the `<Suspense>`
 * boundary, and when a lazy route suspends React hides the subtree and tears down its effects,
 * which would silently unregister the listener while a chunk loads. `App` never suspends.
 *
 * Cold starts are handled elsewhere, in the lock store's `onRehydrateStorage`, so that the
 * decision lands before the first render and cannot be double-fired by StrictMode.
 */
export function useAutoLock(): void {
  const config = useAppLockStore((s) => s.config);
  const enabled = config?.enabled === true;
  const autoLockMinutes = config?.autoLockMinutes ?? 0;

  useEffect(() => {
    if (!enabled) {
      clearBackgroundedAt();
      return;
    }

    const onHidden = () => {
      writeBackgroundedAt(Date.now());
      // "Immediately" flips synchronously here so the OS task-switcher snapshot has the best
      // chance of catching the lock screen rather than the user's balances.
      if (autoLockMinutes <= 0) useAppLockStore.getState().lock();
    };

    const onVisible = () => {
      const state = useAppLockStore.getState();
      if (state.isLocked) return;
      if (
        shouldLockOnResume({
          backgroundedAt: readBackgroundedAt(),
          autoLockMinutes,
          now: Date.now(),
        })
      ) {
        state.lock();
      }
    };

    const onVisibilityChange = () =>
      document.visibilityState === 'hidden' ? onHidden() : onVisible();

    // `visibilitychange` plus `pagehide` only. `freeze`/`resume` are always preceded and
    // followed by a hidden/visible transition, so they could only fire redundantly. `pagehide`
    // earns its place by firing on reload, which is what keeps a refresh from demanding a PIN.
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onHidden);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onHidden);
    };
  }, [enabled, autoLockMinutes]);
}
