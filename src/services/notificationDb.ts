import type { ScheduledNotification } from '@/utils/notifications';

/**
 * The reminder schedule and the "already fired" ledger.
 *
 * IndexedDB rather than the Zustand store, and that is forced rather than preferred. A service
 * worker cannot read or write localStorage, so a ledger kept there would let the SW re-fire a
 * reminder the app had already shown — and vice versa. IndexedDB is the only storage both
 * contexts can agree on.
 *
 * It is also the right home on its own merits: this is churning machine state, and the backup
 * payload spreads the whole finance store, so a ledger living there would bloat every export,
 * cloud upload and import diff with garbage.
 *
 * Raw IDB with no wrapper dependency, matching `backupFolder.ts` — this module is imported by
 * the service worker, whose bundle is re-downloaded on every update.
 */

const DB_NAME = 'finio-notifications';
const DB_VERSION = 1;
const SCHEDULE_STORE = 'schedule';
const FIRED_STORE = 'fired';

interface FiredRecord {
  id: string;
  firedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCHEDULE_STORE)) {
        // No index: the row count is bounded by the 45-day horizon, so a getAll() beats a cursor.
        db.createObjectStore(SCHEDULE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FIRED_STORE)) {
        db.createObjectStore(FIRED_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readSchedule(): Promise<ScheduledNotification[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SCHEDULE_STORE, 'readonly').objectStore(SCHEDULE_STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as ScheduledNotification[]);
    req.onerror = () => reject(req.error);
  });
}

/** Clear-then-put in a single transaction, so a concurrent reader never sees half a schedule. */
export async function writeSchedule(entries: ScheduledNotification[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEDULE_STORE, 'readwrite');
    const store = tx.objectStore(SCHEDULE_STORE);
    store.clear();
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readFiredIds(): Promise<Set<string>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FIRED_STORE, 'readonly').objectStore(FIRED_STORE).getAllKeys();
    req.onsuccess = () => resolve(new Set((req.result ?? []) as string[]));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Claim the right to show a notification, returning false if someone already has it.
 *
 * `add()` rejects on an existing key, which makes the claim atomic for free. That is what keeps
 * two tabs — or a tab and the service worker — waking at the same moment from double-showing,
 * and it doubles as the defence against React StrictMode running the effect twice in dev.
 */
export async function claimFired(id: string, firedAt: number): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIRED_STORE, 'readwrite');
    const req = tx.objectStore(FIRED_STORE).add({ id, firedAt } satisfies FiredRecord);
    req.onsuccess = () => resolve(true);
    req.onerror = (event) => {
      // A ConstraintError means someone beat us to it — not a failure, just a lost race.
      // preventDefault stops the error bubbling up and aborting the whole transaction.
      event.preventDefault();
      resolve(false);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Drop ledger entries older than `before`.
 *
 * By age only, never by "no longer in the schedule": a fired reminder leaves the schedule as
 * soon as it expires, so pruning on absence would let every one of them fire again.
 */
export async function pruneFired(before: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIRED_STORE, 'readwrite');
    const store = tx.objectStore(FIRED_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      for (const row of (req.result ?? []) as FiredRecord[]) {
        if (row.firedAt < before) store.delete(row.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Wipe both stores — used when reminders are turned off, or the user resets their data. */
export async function clearNotificationData(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SCHEDULE_STORE, FIRED_STORE], 'readwrite');
    tx.objectStore(SCHEDULE_STORE).clear();
    tx.objectStore(FIRED_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
