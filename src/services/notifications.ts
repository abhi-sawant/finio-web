import { useFinanceStore } from '@/store/useFinanceStore';
import { clearNotificationData, pruneFired, writeSchedule } from '@/services/notificationDb';
import { fireDueNotifications } from '@/services/notificationRunner';
import { buildNotificationSchedule } from '@/utils/notificationSchedule';
import { NOTIFICATION_SYNC_TAG, type NotificationPrefs } from '@/utils/notifications';
import { normalizeMonthStartDay } from '@/utils/period';

/**
 * The DOM-side half of local reminders: capability probes, the permission request, and the
 * "rebuild the schedule then show anything due" entry point the app calls on start and resume.
 *
 * Never imported by the service worker — that side goes through `notificationRunner.ts`, which
 * is careful to touch neither `window` nor the store.
 *
 * Note we deliberately do not import `virtual:pwa-register`: `tsconfig.app.json` declares only
 * `["vite/client"]` and there is no `vite-env.d.ts`, so the virtual module is a hard `tsc -b`
 * break. `navigator.serviceWorker.ready` gives us the registration we need anyway.
 */

/** How long a fired-reminder record is kept before it is pruned. */
const FIRED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Periodic sync asks for twice a day; the browser treats this as a floor, not a promise. */
const PERIODIC_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Mirrors `backup.ts`'s `backupInProgress` — also the StrictMode double-mount guard. */
let refreshInFlight = false;

export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'showNotification' in ServiceWorkerRegistration.prototype
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return isNotificationSupported() ? Notification.permission : 'unsupported';
}

/**
 * Must be called straight from a user gesture, before any `await` — otherwise the browser has
 * already consumed the activation and silently resolves 'denied'.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Whether a background wake-up is actually registered for this device.
 *
 * Checks the registered tags rather than merely probing for the API: only Chromium with the PWA
 * installed gets this far, and claiming "even when Finio is closed" on the strength of the API
 * existing would overclaim on exactly the platforms where it silently does nothing.
 */
export async function isPeriodicSyncActive(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.periodicSync) return false;
    const tags = await registration.periodicSync.getTags();
    return tags.includes(NOTIFICATION_SYNC_TAG);
  } catch {
    return false;
  }
}

/**
 * Best-effort background wake-up. Also gated on the browser's own site-engagement heuristics,
 * so a `false` return is ordinary and never worth surfacing as an error.
 */
export async function enablePeriodicSync(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.periodicSync) return false;

    // Throws TypeError on browsers that do not know the permission name.
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state !== 'granted') return false;

    await registration.periodicSync.register(NOTIFICATION_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_INTERVAL_MS,
    });
    return true;
  } catch {
    return false;
  }
}

export async function disablePeriodicSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.periodicSync?.unregister(NOTIFICATION_SYNC_TAG);
  } catch {
    /* nothing registered, or unsupported — either way there is nothing to undo */
  }
}

function currentPrefs(): NotificationPrefs {
  const { settings } = useFinanceStore.getState();
  return {
    notificationsEnabled: settings.notificationsEnabled,
    notifyBills: settings.notifyBills,
    notifyBudgets: settings.notifyBudgets,
    notifyCreditDue: settings.notifyCreditDue,
    notifyLeadDays: settings.notifyLeadDays,
    hideAmounts: settings.hideAmounts,
  };
}

/**
 * The stored preference is not authority on its own: permission can be revoked in browser
 * settings behind the app's back, and a restored backup can carry `notificationsEnabled: true`
 * from a device that was granted it.
 */
function canNotify(): boolean {
  return notificationPermission() === 'granted' && currentPrefs().notificationsEnabled;
}

/** Show anything due right now. Cheap — one IndexedDB read when there is nothing to do. */
export async function runDueNotifications(now = new Date()): Promise<number> {
  if (!canNotify()) return 0;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await fireDueNotifications(registration, now.getTime());
  } catch {
    return 0;
  }
}

/**
 * Rebuild the schedule from current data and immediately fire anything already due.
 *
 * Called on app start (after recurring processing, so generated bills aren't announced as
 * upcoming), on resume, and whenever a reminder preference changes.
 */
export async function refreshNotificationSchedule(now = new Date()): Promise<void> {
  if (refreshInFlight) return;
  refreshInFlight = true;

  try {
    if (!canNotify()) {
      await writeSchedule([]);
      return;
    }

    const state = useFinanceStore.getState();
    const schedule = buildNotificationSchedule(
      {
        recurring: state.recurring,
        budgets: state.budgets,
        transactions: state.transactions,
        accounts: state.accounts,
        categories: state.categories,
        labels: state.labels,
        monthStartDay: normalizeMonthStartDay(state.settings.monthStartDay),
        prefs: currentPrefs(),
      },
      now,
    );

    await writeSchedule(schedule);
    await pruneFired(now.getTime() - FIRED_RETENTION_MS);
    await runDueNotifications(now);
  } catch {
    /* silent: reminders are a convenience, never a reason to interrupt the app */
  } finally {
    refreshInFlight = false;
  }
}

/** Turning reminders off: stop the background wake-ups and drop the pending schedule. */
export async function teardownNotifications(): Promise<void> {
  await disablePeriodicSync();
  try {
    await writeSchedule([]);
  } catch {
    /* nothing stored yet */
  }
}

/** Wipe schedule and ledger — for a data reset, where the schedule would point at deleted rows. */
export async function resetNotificationData(): Promise<void> {
  try {
    await clearNotificationData();
  } catch {
    /* nothing stored yet */
  }
}

/**
 * A reminder the user can trigger on demand. Without this there is no way to confirm the
 * pipeline works, since a real reminder may be days out.
 */
export async function showTestNotification(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Reminders are on', {
    body: 'This is what a Finio reminder looks like.',
    tag: 'finio-test',
    icon: '/pwa-192x192.png',
    badge: '/pwa-96x96.png',
    data: { url: '/settings' },
  });
}
