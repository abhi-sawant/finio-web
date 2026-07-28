import { addDays, format, setHours, startOfDay, subDays } from 'date-fns';
import { futureOccurrences } from '@/store/recurring';
import {
  activeAccounts,
  budgetHealth,
  computeBudgetStatuses,
  getCreditCardDueInfo,
} from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';
import {
  NOTIFICATION_HORIZON_DAYS,
  NOTIFY_HOUR,
  type NotificationPrefs,
  type ScheduledNotification,
} from '@/utils/notifications';
import type {
  Account,
  Budget,
  Category,
  Label,
  RecurringTransaction,
  Transaction,
} from '@/types';

/**
 * Turns the user's data into a flat list of dated reminders.
 *
 * Pure and `now`-taking, because the schedule is rebuilt from scratch on every app open and the
 * ids must come out identical each time — that stability *is* the dedupe contract (see
 * `ScheduledNotification.id`). Anything derived from "when we happened to rebuild" would let a
 * reminder fire twice.
 */

export interface NotificationScheduleInput {
  recurring: RecurringTransaction[];
  budgets: Budget[];
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  labels: Label[];
  monthStartDay: number;
  prefs: NotificationPrefs;
}

/** `yyyy-MM-dd` in local time — the occurrence's identity, independent of the lead time. */
function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * When to actually show a reminder for something due on `dueDate`.
 *
 * Clamped forward to `now`: if the app went unopened through the whole lead window, the
 * reminder is late rather than lost. Clamping here (and never in the id) is what lets the lead
 * time change without re-firing anything already sent.
 */
function leadFireAt(dueDate: Date, leadDays: number, now: Date): number {
  const target = setHours(startOfDay(subDays(dueDate, leadDays)), NOTIFY_HOUR);
  return Math.max(now.getTime(), target.getTime());
}

function relativeDueLabel(dueDate: Date, now: Date): string {
  const days = Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function buildBillEntries(
  input: NotificationScheduleInput,
  now: Date,
): ScheduledNotification[] {
  const { prefs, recurring, categories } = input;
  if (!prefs.notifyBills) return [];

  const horizonEnd = addDays(now, NOTIFICATION_HORIZON_DAYS);
  const entries: ScheduledNotification[] = [];

  for (const rule of recurring) {
    // `from = now`, not the start of today: this runs after `processRecurring()`, so anything
    // due at or before now is already a real transaction. Reaching back to catch "today" would
    // resurrect an occurrence that was just generated.
    //
    // `futureOccurrences` already returns [] for a paused rule and honours endDate /
    // maxOccurrences, which is exactly why it beats `nextDueDate` here.
    for (const occurrence of futureOccurrences(rule, now, horizonEnd)) {
      const categoryName = categories.find((c) => c.id === rule.categoryId)?.name ?? 'Recurring';
      const name = rule.note?.trim() || categoryName;

      entries.push({
        id: `bill:${rule.id}:${dayKey(occurrence)}`,
        kind: 'bill',
        fireAt: leadFireAt(occurrence, prefs.notifyLeadDays, now),
        expiresAt: startOfDay(addDays(occurrence, 1)).getTime(),
        title: `Bill due ${relativeDueLabel(occurrence, now)}`,
        body: `${name} · ${formatCurrency(rule.amount, false, prefs.hideAmounts)}`,
        url: '/recurring',
      });
    }
  }

  return entries;
}

function buildBudgetEntries(
  input: NotificationScheduleInput,
  now: Date,
): ScheduledNotification[] {
  const { prefs, budgets, transactions, categories, labels, monthStartDay } = input;
  if (!prefs.notifyBudgets) return [];

  const statuses = computeBudgetStatuses(budgets, transactions, { monthStartDay, now });
  const entries: ScheduledNotification[] = [];

  for (const status of statuses) {
    const health = budgetHealth(status);
    if (health === 'ok') continue;

    const { budget } = status;
    const scopeName = budget.labelId
      ? (labels.find((l) => l.id === budget.labelId)?.name ?? 'Budget')
      : budget.categoryId
        ? (categories.find((c) => c.id === budget.categoryId)?.name ?? 'Budget')
        : 'Overall';

    entries.push({
      // The period is keyed by its start, so the reminder re-arms by itself when the period
      // rolls and follows `monthStartDay`. Severity is in the key too: crossing from "near" to
      // "over" mid-period is news worth a second reminder, but each is still sent only once.
      id: `budget:${budget.id}:${status.range.start.toISOString()}:${health}`,
      kind: 'budget',
      // Budget breaches are already true when the schedule is built — there is nothing to wait
      // for. (They are also foreground-only in practice: they derive from transactions in
      // localStorage, which a service worker cannot read.)
      fireAt: now.getTime(),
      expiresAt: status.range.end.getTime() + 1,
      title: health === 'over' ? `${scopeName} is over budget` : `${scopeName} is near its limit`,
      body: `${formatCurrency(status.spent, false, prefs.hideAmounts)} of ${formatCurrency(
        status.limit,
        false,
        prefs.hideAmounts,
      )} spent`,
      url: '/budgets',
    });
  }

  return entries;
}

function buildCreditEntries(
  input: NotificationScheduleInput,
  now: Date,
): ScheduledNotification[] {
  const { prefs, accounts } = input;
  if (!prefs.notifyCreditDue) return [];

  const entries: ScheduledNotification[] = [];

  for (const account of activeAccounts(accounts).filter((a) => a.type === 'credit')) {
    // Returns null unless the card has a statement cycle configured and something outstanding.
    const dueInfo = getCreditCardDueInfo(account, now);
    if (!dueInfo) continue;

    entries.push({
      id: `credit:${account.id}:${dayKey(dueInfo.dueDate)}`,
      kind: 'credit',
      fireAt: leadFireAt(dueInfo.dueDate, prefs.notifyLeadDays, now),
      // A day longer than a bill: an already-overdue card is still worth surfacing.
      expiresAt: startOfDay(addDays(dueInfo.dueDate, 2)).getTime(),
      title: dueInfo.isOverdue
        ? `${account.name} payment is overdue`
        : `${account.name} payment due ${relativeDueLabel(dueInfo.dueDate, now)}`,
      body: `${formatCurrency(dueInfo.outstanding, false, prefs.hideAmounts)} outstanding · min ${formatCurrency(
        dueInfo.minimumDue,
        false,
        prefs.hideAmounts,
      )}`,
      url: '/accounts',
    });
  }

  return entries;
}

export function buildNotificationSchedule(
  input: NotificationScheduleInput,
  now: Date,
): ScheduledNotification[] {
  if (!input.prefs.notificationsEnabled) return [];

  return [
    ...buildBillEntries(input, now),
    ...buildBudgetEntries(input, now),
    ...buildCreditEntries(input, now),
  ];
}
