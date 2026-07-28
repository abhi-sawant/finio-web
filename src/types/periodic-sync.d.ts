/**
 * Periodic Background Sync — not in lib.dom.d.ts, so it is hand-written here in the same
 * spirit as `file-system-access.d.ts`.
 *
 * Deliberately lib-agnostic: `ServiceWorkerRegistration` is declared in both the DOM and the
 * WebWorker libs, so this one interface merge serves the app project and the service-worker
 * project alike. The WebWorker-only pieces (`PeriodicSyncEvent`) live in `src/sw/sw-globals.d.ts`.
 */

interface PeriodicSyncRegistrationOptions {
  /** Minimum ms between wake-ups. A floor the browser may ignore, never a schedule. */
  minInterval?: number;
}

interface PeriodicSyncManager {
  register(tag: string, options?: PeriodicSyncRegistrationOptions): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistration {
  /** Absent on every non-Chromium browser — always feature-detect before use. */
  readonly periodicSync?: PeriodicSyncManager;
}
