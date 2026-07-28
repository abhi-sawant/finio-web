import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BackupCryptoConfig } from '@/types';

interface BackupCryptoStore {
  /** Null when backup encryption has never been set up, or has been disabled. */
  config: BackupCryptoConfig | null;

  /** Transient — excluded by `partialize`, and not JSON-serializable to begin with. Cached for
   *  the lifetime of this tab so automatic background backups can run without a passphrase
   *  prompt; lost on reload by design, per the chosen UX (see `services/backup.ts`). */
  sessionKey: CryptoKey | null;
  /** Which salt `sessionKey` was derived from, so a rotated passphrase (a different salt) is
   *  detected as "locked" rather than silently reused. */
  sessionKeySalt: string | null;

  setConfig: (config: BackupCryptoConfig) => void;
  clearConfig: () => void;
  setSessionKey: (key: CryptoKey | null, salt: string | null) => void;
}

/**
 * Cloud backup encryption state, in its own store under `finio-backup-crypto`.
 *
 * Separate from `finio-storage` and `finio-auth` on purpose — see the note on
 * `BackupCryptoConfig`. The short version: the finance store is what gets exported and uploaded,
 * and encryption key material has no business in a portable payload, doubly so here since it's
 * the very thing protecting that payload.
 */
export const useBackupCryptoStore = create<BackupCryptoStore>()(
  persist(
    (set) => ({
      config: null,
      sessionKey: null,
      sessionKeySalt: null,

      setConfig: (config) => set({ config }),

      clearConfig: () => set({ config: null, sessionKey: null, sessionKeySalt: null }),

      setSessionKey: (key, salt) => set({ sessionKey: key, sessionKeySalt: salt }),
    }),
    {
      name: 'finio-backup-crypto',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Explicit allow-list rather than a rest-spread: a future transient field someone adds and
      // forgets to exclude gets dropped (fail-safe) rather than persisted (fail-open) — same
      // reasoning as `useAppLockStore`. `sessionKey`/`sessionKeySalt` are excluded here, and a
      // `CryptoKey` couldn't be persisted anyway since it isn't JSON-serializable.
      partialize: (state) => ({ config: state.config }),
    },
  ),
);
