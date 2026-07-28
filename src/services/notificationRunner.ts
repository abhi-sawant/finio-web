import { claimFired, readFiredIds, readSchedule } from '@/services/notificationDb';
import { selectDueNotifications } from '@/utils/notifications';

/**
 * Show whatever is due. Called from two places with two different registrations: the app passes
 * `await navigator.serviceWorker.ready`, the service worker passes `self.registration`.
 *
 * One module can serve both because `ServiceWorkerRegistration` is declared in the DOM lib and
 * the WebWorker lib alike — which is also why this file must not touch `window` or `document`.
 */
export async function fireDueNotifications(
  registration: ServiceWorkerRegistration,
  now: number,
): Promise<number> {
  const [schedule, firedIds] = await Promise.all([readSchedule(), readFiredIds()]);
  const due = selectDueNotifications(schedule, firedIds, now);

  let shown = 0;
  for (const entry of due) {
    // Claim before showing, never after: the claim is the atomic step, so a crash between the
    // two costs a missed reminder rather than a duplicated one.
    if (!(await claimFired(entry.id, now))) continue;

    await registration.showNotification(entry.title, {
      body: entry.body,
      // Same id → a re-show replaces rather than stacks. Safe only because ids are occurrence-
      // keyed and unique; loosening that would silently swallow legitimate reminders.
      tag: entry.id,
      icon: '/pwa-192x192.png',
      badge: '/pwa-96x96.png',
      data: { url: entry.url },
    });
    shown += 1;
  }

  return shown;
}
