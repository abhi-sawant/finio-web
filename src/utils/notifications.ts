/**
 * Shared types and selection logic for local reminders.
 *
 * This module is deliberately a leaf with no value imports: it is pulled into the *service
 * worker* bundle, which is re-downloaded on every SW update, so anything heavy here is paid
 * for repeatedly. The schedule *builder* lives in `notificationSchedule.ts` and stays app-side.
 */

/** Periodic Background Sync tag. Shared between the registration call and the SW handler. */
export const NOTIFICATION_SYNC_TAG = 'finio-notifications';

/** How far ahead the schedule looks. Bounds the IndexedDB row count to something trivial. */
export const NOTIFICATION_HORIZON_DAYS = 45;

/** Upper bound on `Settings.notifyLeadDays`. */
export const MAX_NOTIFY_LEAD_DAYS = 7;

/**
 * Local hour of day reminders land at. A constant rather than a setting: there is no evidence
 * anyone wants to move it, and it would cost a settings field, a migration key and a control.
 */
export const NOTIFY_HOUR = 9;

/**
 * Never show more than this in one pass. Someone returning after a month away should get a
 * useful nudge, not twenty stacked banners; the rest expire quietly.
 */
export const MAX_NOTIFICATIONS_PER_RUN = 3;

export type NotificationKind = 'bill' | 'budget' | 'credit';

export interface ScheduledNotification {
  /**
   * `${kind}:${subjectId}:${occurrenceKey}` — the dedupe contract. It must be derivable from
   * the trigger alone, so that rebuilding the schedule at a different moment produces the
   * same id and an already-fired reminder is never sent twice.
   */
  id: string;
  kind: NotificationKind;
  /** Epoch ms from which this is eligible to fire. */
  fireAt: number;
  /** Epoch ms after which it is stale and must never fire. */
  expiresAt: number;
  title: string;
  body: string;
  /** In-app path to open when the notification is clicked. */
  url: string;
}

/** The slice of `Settings` the scheduler cares about, plus the amount-masking flag. */
export interface NotificationPrefs {
  notificationsEnabled: boolean;
  notifyBills: boolean;
  notifyBudgets: boolean;
  notifyCreditDue: boolean;
  notifyLeadDays: number;
  /** Mirrors `Settings.hideAmounts` — a lock-screen preview is exactly what it exists for. */
  hideAmounts: boolean;
}

/**
 * Which entries are due right now and have not already been shown.
 *
 * Pure so both the foreground pass and the service worker can agree on the answer; `firedIds`
 * comes from the shared IndexedDB ledger, which is the only thing the two contexts can both
 * write to.
 */
export function selectDueNotifications(
  schedule: ScheduledNotification[],
  firedIds: ReadonlySet<string>,
  now: number,
): ScheduledNotification[] {
  return schedule
    .filter((entry) => entry.fireAt <= now && now < entry.expiresAt && !firedIds.has(entry.id))
    .sort((a, b) => a.fireAt - b.fireAt)
    .slice(0, MAX_NOTIFICATIONS_PER_RUN);
}
