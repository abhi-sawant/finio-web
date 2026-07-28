import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import { readBackgroundedAt } from '@/services/appLockSession';
import { nextLockoutUntil, shouldLockOnResume } from '@/utils/appLock';
import type { AppLockConfig } from '@/types';

interface AppLockStore {
  /** Null when the lock has never been set up, or has been disabled. */
  config: AppLockConfig | null;
  /** Persisted: reloading the page must not wipe the cooldown. */
  failedAttempts: number;
  lockedOutUntil: number | null;

  /** Transient — excluded by `partialize`. */
  isLocked: boolean;
  /** Transient — the lock store's counterpart to the finance store's `isHydrated`. */
  isReady: boolean;

  setConfig: (config: AppLockConfig) => void;
  clearConfig: () => void;
  setAutoLockMinutes: (minutes: number) => void;
  setWebauthnCredentialId: (id: string | null) => void;
  lock: () => void;
  unlock: () => void;
  registerFailure: (now?: number) => void;
  /** Cooldown served. Clears the deadline but keeps the count, so the ladder keeps escalating. */
  expireLockout: () => void;
  setReady: (ready: boolean) => void;
}

/**
 * App lock state, in its own store under `finio-lock`.
 *
 * Separate from `finio-storage` on purpose — see the note on `AppLockConfig`. The short version:
 * the finance store is what gets exported and uploaded, and a PIN hash has no business in a
 * portable payload. Keeping it here also means `resetToDefaults()` cannot unlock the app and
 * `importData()` cannot import someone else's PIN, with no scrubbing code anywhere.
 */
export const useAppLockStore = create<AppLockStore>()(
  persist(
    (set) => ({
      config: null,
      failedAttempts: 0,
      lockedOutUntil: null,
      isLocked: false,
      isReady: false,

      setConfig: (config) => set({ config, failedAttempts: 0, lockedOutUntil: null }),

      clearConfig: () =>
        set({ config: null, failedAttempts: 0, lockedOutUntil: null, isLocked: false }),

      setAutoLockMinutes: (minutes) =>
        set((state) => ({
          config: state.config ? { ...state.config, autoLockMinutes: minutes } : null,
        })),

      setWebauthnCredentialId: (id) =>
        set((state) => ({
          config: state.config ? { ...state.config, webauthnCredentialId: id } : null,
        })),

      lock: () => {
        // <Toaster> is mounted above the lock gate, so an amount-bearing toast fired just before
        // backgrounding ("Added ₹250") would sit on top of the lock screen. Small, but a leak.
        toast.dismiss();
        set({ isLocked: true });
      },

      unlock: () => set({ isLocked: false, failedAttempts: 0, lockedOutUntil: null }),

      registerFailure: (now = Date.now()) =>
        set((state) => {
          const failedAttempts = state.failedAttempts + 1;
          return { failedAttempts, lockedOutUntil: nextLockoutUntil(failedAttempts, now) };
        }),

      expireLockout: () => set({ lockedOutUntil: null }),

      setReady: (isReady) => set({ isReady }),
    }),
    {
      name: 'finio-lock',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Explicit allow-list rather than a rest-spread: on a store this small it is unambiguous,
      // and a future transient field added by someone who forgets to update it gets dropped
      // (fail-safe) rather than persisted (fail-open).
      partialize: (state) => ({
        config: state.config,
        failedAttempts: state.failedAttempts,
        lockedOutUntil: state.lockedOutUntil,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Decide here rather than in a mount effect: localStorage is synchronous, so this runs
        // before React's first render — no flash of unlocked content — and it is immune to
        // StrictMode double-mounting, which a `lock()` inside an effect would not be.
        const locked =
          state.config?.enabled === true &&
          shouldLockOnResume({
            backgroundedAt: readBackgroundedAt(),
            autoLockMinutes: state.config.autoLockMinutes,
            now: Date.now(),
          });

        state.setReady(true);
        if (locked) state.lock();
      },
    },
  ),
);
