import { describe, expect, it } from 'vitest';
import { buildNotificationSchedule, type NotificationScheduleInput } from './notificationSchedule';
import { DAILY_LOG_HOUR, NOTIFY_HOUR, type NotificationPrefs } from './notifications';
import type {
  Account,
  Budget,
  Category,
  Label,
  RecurringTransaction,
  Transaction,
} from '@/types';

/**
 * Built from local components rather than an ISO string, unlike the other suites here: reminder
 * fire times are local-hour arithmetic (`NOTIFY_HOUR`), so every assertion below reads local
 * calendar fields. An ISO literal would pass in one time zone and fail in another.
 */
const NOW = new Date(2026, 5, 15, 12, 0, 0); // 15 June 2026, local noon

const categories: Category[] = [
  { id: 'cat-food', name: 'Food', icon: 'utensils', color: '#f00', type: 'expense' },
  { id: 'cat-bills', name: 'Utilities', icon: 'zap', color: '#0f0', type: 'expense' },
];

const labels: Label[] = [{ id: 'lbl-1', name: 'Essential', color: '#00f' }];

function prefs(partial: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    notificationsEnabled: true,
    notifyBills: true,
    notifyBudgets: true,
    notifyCreditDue: true,
    notifyLeadDays: 2,
    notifyDailyLog: true,
    hideAmounts: false,
    ...partial,
  };
}

function input(partial: Partial<NotificationScheduleInput> = {}): NotificationScheduleInput {
  return {
    recurring: [],
    budgets: [],
    transactions: [],
    accounts: [],
    categories,
    labels,
    monthStartDay: 1,
    prefs: prefs(),
    ...partial,
  };
}

function rule(
  partial: Partial<RecurringTransaction> & Pick<RecurringTransaction, 'id' | 'startDate'>,
): RecurringTransaction {
  return {
    type: 'expense',
    amount: 500,
    accountId: 'acc-1',
    categoryId: 'cat-bills',
    note: 'Broadband',
    labels: [],
    frequency: 'monthly',
    occurrenceCount: 0,
    lastRunDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function budget(partial: Partial<Budget> & Pick<Budget, 'id'>): Budget {
  return {
    categoryId: 'cat-food',
    amount: 1000,
    period: 'monthly',
    rollover: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'amount' | 'date'>,
): Transaction {
  return {
    id: `tx-${partial.date}-${partial.amount}`,
    type: 'expense',
    accountId: 'acc-1',
    categoryId: 'cat-food',
    note: '',
    labels: [],
    createdAt: partial.date,
    ...partial,
  };
}

function account(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: 'HDFC Card',
    type: 'credit',
    color: '#000',
    icon: 'credit-card',
    balance: -5000,
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    creditLimit: 50000,
    statementCloseDay: 20,
    paymentDueDays: 15,
    ...partial,
  };
}

/** Local `yyyy-MM-dd` for a date offset from NOW, matching how the builder keys occurrences. */
function dayFromNow(days: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function isoFromNow(days: number): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, 9, 0, 0).toISOString();
}

describe('buildNotificationSchedule', () => {
  it('returns nothing at all when the master switch is off', () => {
    const schedule = buildNotificationSchedule(
      input({
        prefs: prefs({ notificationsEnabled: false }),
        recurring: [rule({ id: 'r1', startDate: isoFromNow(3) })],
        budgets: [budget({ id: 'b1', amount: 100 })],
        transactions: [tx({ amount: 900, date: isoFromNow(-1) })],
      }),
      NOW,
    );
    expect(schedule).toEqual([]);
  });

  it('honours each per-trigger switch independently', () => {
    const base = input({
      recurring: [rule({ id: 'r1', startDate: isoFromNow(3) })],
      budgets: [budget({ id: 'b1', amount: 100 })],
      transactions: [tx({ amount: 900, date: isoFromNow(-1) })],
      accounts: [account({ id: 'acc-card' })],
    });

    const noBills = buildNotificationSchedule(
      { ...base, prefs: prefs({ notifyBills: false }) },
      NOW,
    );
    expect(noBills.some((e) => e.kind === 'bill')).toBe(false);
    expect(noBills.some((e) => e.kind === 'budget')).toBe(true);

    const noBudgets = buildNotificationSchedule(
      { ...base, prefs: prefs({ notifyBudgets: false }) },
      NOW,
    );
    expect(noBudgets.some((e) => e.kind === 'budget')).toBe(false);
    expect(noBudgets.some((e) => e.kind === 'bill')).toBe(true);

    const noCredit = buildNotificationSchedule(
      { ...base, prefs: prefs({ notifyCreditDue: false }) },
      NOW,
    );
    expect(noCredit.some((e) => e.kind === 'credit')).toBe(false);
  });

  describe('ids', () => {
    it('are identical across rebuilds at different moments — the dedupe contract', () => {
      // The schedule is rebuilt from scratch on every app open. If an id moved with the rebuild
      // time, every reminder would fire again on the next launch.
      const data = input({
        recurring: [rule({ id: 'r1', startDate: isoFromNow(5) })],
        budgets: [budget({ id: 'b1', amount: 100 })],
        transactions: [tx({ amount: 900, date: isoFromNow(-1) })],
        accounts: [account({ id: 'acc-card' })],
      });

      const first = buildNotificationSchedule(data, NOW);
      const laterSameDay = buildNotificationSchedule(
        data,
        new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 18, 30),
      );

      expect(first.map((e) => e.id).sort()).toEqual(laterSameDay.map((e) => e.id).sort());
      expect(first.length).toBeGreaterThan(0);
    });

    it('differ between two occurrences of the same rule', () => {
      const schedule = buildNotificationSchedule(
        input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(3), frequency: 'weekly' })] }),
        NOW,
      );
      const ids = schedule.filter((e) => e.kind === 'bill').map((e) => e.id);
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('bills', () => {
    it('fires at NOTIFY_HOUR on the lead day before the due date', () => {
      const schedule = buildNotificationSchedule(
        input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(5) })] }),
        NOW,
      );
      const bill = schedule.find((e) => e.id === `bill:r1:${dayFromNow(5)}`);
      expect(bill).toBeDefined();

      const fire = new Date(bill!.fireAt);
      expect(fire.getDate()).toBe(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 3).getDate());
      expect(fire.getHours()).toBe(NOTIFY_HOUR);
    });

    it('clamps a missed lead window forward to now, so the reminder is late rather than lost', () => {
      const schedule = buildNotificationSchedule(
        input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(1) })] }),
        NOW,
      );
      const bill = schedule.find((e) => e.kind === 'bill');
      expect(bill?.fireAt).toBe(NOW.getTime());
    });

    it('ignores a paused rule', () => {
      const schedule = buildNotificationSchedule(
        input({
          recurring: [
            rule({ id: 'r1', startDate: isoFromNow(3), pausedAt: '2026-06-01T00:00:00.000Z' }),
          ],
        }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'bill')).toEqual([]);
    });

    it('ignores a rule that has run out of occurrences or passed its end date', () => {
      const exhausted = buildNotificationSchedule(
        input({
          recurring: [
            rule({ id: 'r1', startDate: isoFromNow(3), maxOccurrences: 2, occurrenceCount: 2 }),
          ],
        }),
        NOW,
      );
      expect(exhausted.filter((e) => e.kind === 'bill')).toEqual([]);

      const ended = buildNotificationSchedule(
        input({
          recurring: [rule({ id: 'r1', startDate: isoFromNow(3), endDate: isoFromNow(1) })],
        }),
        NOW,
      );
      expect(ended.filter((e) => e.kind === 'bill')).toEqual([]);
    });

    it('ignores an occurrence beyond the scheduling horizon', () => {
      const schedule = buildNotificationSchedule(
        input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(200), frequency: 'yearly' })] }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'bill')).toEqual([]);
    });

    it('expires the morning after the due date', () => {
      const schedule = buildNotificationSchedule(
        input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(5) })] }),
        NOW,
      );
      const bill = schedule.find((e) => e.kind === 'bill')!;
      const expires = new Date(bill.expiresAt);
      expect(expires.getDate()).toBe(
        new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 6).getDate(),
      );
      expect(expires.getHours()).toBe(0);
    });
  });

  describe('budgets', () => {
    const spendTo = (amount: number) => [tx({ amount, date: isoFromNow(-1) })];

    it('says nothing below the near-limit threshold', () => {
      const schedule = buildNotificationSchedule(
        input({ budgets: [budget({ id: 'b1', amount: 1000 })], transactions: spendTo(840) }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'budget')).toEqual([]);
    });

    it('warns once at the near-limit threshold', () => {
      const schedule = buildNotificationSchedule(
        input({ budgets: [budget({ id: 'b1', amount: 1000 })], transactions: spendTo(850) }),
        NOW,
      );
      const budgetEntries = schedule.filter((e) => e.kind === 'budget');
      expect(budgetEntries).toHaveLength(1);
      expect(budgetEntries[0].id).toContain(':near');
    });

    it('warns once when over, and does not also send the near-limit warning', () => {
      const schedule = buildNotificationSchedule(
        input({ budgets: [budget({ id: 'b1', amount: 1000 })], transactions: spendTo(1010) }),
        NOW,
      );
      const budgetEntries = schedule.filter((e) => e.kind === 'budget');
      expect(budgetEntries).toHaveLength(1);
      expect(budgetEntries[0].id).toContain(':over');
    });

    it('re-arms when the period rolls', () => {
      // Same budget blown in two consecutive months must produce two distinct ids, or the
      // second month's overspend would be silently swallowed as already-notified.
      const nextMonth = new Date(2026, 6, 15, 12, 0, 0);
      const june = buildNotificationSchedule(
        input({
          budgets: [budget({ id: 'b1', amount: 1000 })],
          transactions: [tx({ amount: 1010, date: new Date(2026, 5, 14).toISOString() })],
        }),
        NOW,
      );
      const july = buildNotificationSchedule(
        input({
          budgets: [budget({ id: 'b1', amount: 1000 })],
          transactions: [tx({ amount: 1010, date: new Date(2026, 6, 14).toISOString() })],
        }),
        nextMonth,
      );
      expect(june[0].id).toContain(':over');
      expect(july[0].id).toContain(':over');
      expect(june[0].id).not.toBe(july[0].id);
    });

    it('follows monthStartDay, so a salary-cycle month is its own period', () => {
      const data = {
        budgets: [budget({ id: 'b1', amount: 1000 })],
        transactions: spendTo(1010),
      };
      const fromFirst = buildNotificationSchedule(input({ ...data, monthStartDay: 1 }), NOW);
      const from25th = buildNotificationSchedule(input({ ...data, monthStartDay: 25 }), NOW);
      expect(fromFirst[0].id).not.toBe(from25th[0].id);
    });

    it('names an overall budget rather than leaving it blank', () => {
      const schedule = buildNotificationSchedule(
        input({
          budgets: [budget({ id: 'b1', categoryId: '', amount: 1000 })],
          transactions: spendTo(1010),
        }),
        NOW,
      );
      expect(schedule[0].title).toContain('Overall');
    });
  });

  describe('credit card dues', () => {
    it('reminds about a configured card with an outstanding balance', () => {
      const schedule = buildNotificationSchedule(
        input({ accounts: [account({ id: 'acc-card' })] }),
        NOW,
      );
      const credit = schedule.filter((e) => e.kind === 'credit');
      expect(credit).toHaveLength(1);
      expect(credit[0].url).toBe('/accounts');
    });

    it('says nothing for a card with no statement cycle configured', () => {
      const schedule = buildNotificationSchedule(
        input({
          accounts: [account({ id: 'acc-card', statementCloseDay: undefined })],
        }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'credit')).toEqual([]);
    });

    it('says nothing when there is nothing outstanding', () => {
      const schedule = buildNotificationSchedule(
        input({ accounts: [account({ id: 'acc-card', balance: 0 })] }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'credit')).toEqual([]);
    });

    it('says nothing for an archived card', () => {
      const schedule = buildNotificationSchedule(
        input({
          accounts: [account({ id: 'acc-card', archivedAt: '2026-05-01T00:00:00.000Z' })],
        }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'credit')).toEqual([]);
    });

    it('ignores a non-credit account', () => {
      const schedule = buildNotificationSchedule(
        input({ accounts: [account({ id: 'acc-1', type: 'savings', balance: -500 })] }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'credit')).toEqual([]);
    });
  });

  describe('daily transaction-log reminder', () => {
    it('fires at DAILY_LOG_HOUR when nothing has been logged today', () => {
      const schedule = buildNotificationSchedule(input(), NOW);
      const daily = schedule.find((e) => e.kind === 'daily');
      expect(daily).toBeDefined();
      expect(daily!.id).toBe(`daily:log:${dayFromNow(0)}`);
      expect(new Date(daily!.fireAt).getHours()).toBe(DAILY_LOG_HOUR);
    });

    it('clamps forward to now when opened after DAILY_LOG_HOUR', () => {
      const late = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 22, 0, 0);
      const schedule = buildNotificationSchedule(input(), late);
      const daily = schedule.find((e) => e.kind === 'daily');
      expect(daily?.fireAt).toBe(late.getTime());
    });

    it('says nothing once a transaction has already been logged today', () => {
      const schedule = buildNotificationSchedule(
        input({ transactions: [tx({ amount: 200, date: isoFromNow(0) })] }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'daily')).toEqual([]);
    });

    it('says nothing when the switch is off', () => {
      const schedule = buildNotificationSchedule(
        input({ prefs: prefs({ notifyDailyLog: false }) }),
        NOW,
      );
      expect(schedule.filter((e) => e.kind === 'daily')).toEqual([]);
    });

    it('expires at the start of the next day', () => {
      const schedule = buildNotificationSchedule(input(), NOW);
      const daily = schedule.find((e) => e.kind === 'daily')!;
      const expires = new Date(daily.expiresAt);
      expect(expires.getDate()).toBe(
        new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1).getDate(),
      );
      expect(expires.getHours()).toBe(0);
    });
  });

  it('masks amounts in the body when hideAmounts is on', () => {
    const visible = buildNotificationSchedule(
      input({ recurring: [rule({ id: 'r1', startDate: isoFromNow(3) })] }),
      NOW,
    );
    expect(visible[0].body).toContain('500');

    const hidden = buildNotificationSchedule(
      input({
        recurring: [rule({ id: 'r1', startDate: isoFromNow(3) })],
        prefs: prefs({ hideAmounts: true }),
      }),
      NOW,
    );
    expect(hidden[0].body).toContain('••••');
    expect(hidden[0].body).not.toContain('500');
  });
});
