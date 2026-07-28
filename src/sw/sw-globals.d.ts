/**
 * The WebWorker-only half of the Periodic Background Sync types.
 *
 * Kept out of `types/periodic-sync.d.ts` — which declares the `ServiceWorkerRegistration`
 * side for the app project — because `ExtendableEvent` does not exist under the DOM lib. The
 * two files are independent: the worker only listens for the event, and only the app ever
 * touches `registration.periodicSync`.
 */

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface ServiceWorkerGlobalScopeEventMap {
  periodicsync: PeriodicSyncEvent;
}
