import { format, parseISO } from 'date-fns';
import { sumTransactionDeltas, roundMoney } from '@/store/balance';
import { activeAccounts } from './calculations';
import {
  DEFAULT_MONTH_START_DAY,
  periodLabel,
  periodRange,
  shiftPeriod,
  type PeriodRange,
} from './period';
import type { Account, NetWorthSnapshot, Transaction } from '@/types';

/**
 * Net worth over time.
 *
 * Balances in this app are *derived* — `openingBalance + Σ(transaction deltas)` — so any past
 * value can be reconstructed by walking today's balances backwards through today's
 * transactions. That reconstruction is exact right up until history changes: delete a
 * three-year-old salary credit and every reconstructed point before it moves too, rewriting a
 * trend the user already saw.
 *
 * So the series is built from two sources. Completed financial months are read from a
 * `NetWorthSnapshot` recorded at (or shortly after) the time they closed; anything without a
 * snapshot — the current month, and history from before snapshots existed — is reconstructed
 * and marked as such.
 */

/** How many financial months the chart covers by default. */
export const DEFAULT_NET_WORTH_MONTHS = 12;

/** Cap on how many missing past months one capture pass may backfill. */
export const MAX_SNAPSHOT_BACKFILL = 12;

export interface NetWorthComponents {
  /** Sum of every positive balance across open accounts. */
  assets: number;
  /** Sum of every negative balance as a positive number — credit outstanding. */
  liabilities: number;
  /** `assets - liabilities`, identical to `getNetWorth`. */
  netWorth: number;
}

function componentsFromBalances(balances: number[]): NetWorthComponents {
  let assets = 0;
  let liabilities = 0;
  for (const balance of balances) {
    if (balance > 0) assets = roundMoney(assets + balance);
    else liabilities = roundMoney(liabilities - balance);
  }
  return { assets, liabilities, netWorth: roundMoney(assets - liabilities) };
}

/** Split today's live balances into assets and liabilities. Archived accounts are excluded. */
export function netWorthComponents(accounts: Account[]): NetWorthComponents {
  return componentsFromBalances(activeAccounts(accounts).map((a) => a.balance));
}

/** The identity of the financial month containing `date` — `yyyy-MM` of the month's start. */
export function snapshotPeriodKey(date: Date, monthStartDay = DEFAULT_MONTH_START_DAY): string {
  return format(periodRange('monthly', date, monthStartDay).start, 'yyyy-MM');
}

/**
 * What each open account's balance was at the end of `asOf`, by reversing every transaction
 * recorded after it. Exact for the history currently in the store — which is precisely why
 * completed months get snapshotted rather than recomputed forever.
 */
export function accountBalancesAt(
  accounts: Account[],
  transactions: Transaction[],
  asOf: Date,
): Map<string, number> {
  const cutoff = asOf.getTime();
  const later = transactions.filter((t) => {
    const date = parseISO(t.date);
    return !Number.isNaN(date.getTime()) && date.getTime() > cutoff;
  });
  const deltas = sumTransactionDeltas(later);

  return new Map(
    activeAccounts(accounts).map((a) => [a.id, roundMoney(a.balance - (deltas.get(a.id) ?? 0))]),
  );
}

/** Reconstructed assets/liabilities/net worth at the end of `asOf`. */
export function netWorthAt(
  accounts: Account[],
  transactions: Transaction[],
  asOf: Date,
): NetWorthComponents {
  return componentsFromBalances(
    Array.from(accountBalancesAt(accounts, transactions, asOf).values()),
  );
}

export interface NetWorthPoint extends NetWorthComponents {
  /** `yyyy-MM` of the financial month's start. */
  key: string;
  label: string;
  /** The instant the figures are as of — the period's end, or now for the live period. */
  date: Date;
  /** Where the numbers came from. Reconstructed points move if history is edited. */
  source: 'snapshot' | 'reconstructed';
  /** True for the month still in progress. */
  isCurrent: boolean;
}

export interface NetWorthSeriesInput {
  accounts: Account[];
  transactions: Transaction[];
  snapshots: NetWorthSnapshot[];
  now?: Date;
  monthStartDay?: number;
  /** Number of financial months to include, ending with the one in progress. */
  months?: number;
}

/**
 * The net-worth trend, oldest first: one point per financial month, ending with the month in
 * progress (which is always live rather than snapshotted, since it hasn't closed yet).
 */
export function buildNetWorthSeries(input: NetWorthSeriesInput): NetWorthPoint[] {
  const now = input.now ?? new Date();
  const monthStartDay = input.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const months = Math.max(1, input.months ?? DEFAULT_NET_WORTH_MONTHS);
  const current = periodRange('monthly', now, monthStartDay);
  const byKey = new Map(input.snapshots.map((s) => [s.periodKey, s]));

  const points: NetWorthPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const range = i === 0 ? current : shiftPeriod(current, -i);
    const key = format(range.start, 'yyyy-MM');
    const label = periodLabel(range, monthStartDay);
    const isCurrent = i === 0;

    const snapshot = isCurrent ? undefined : byKey.get(key);
    if (snapshot) {
      points.push({
        key,
        label,
        date: parseISO(snapshot.date),
        assets: snapshot.assets,
        liabilities: snapshot.liabilities,
        netWorth: roundMoney(snapshot.assets - snapshot.liabilities),
        source: 'snapshot',
        isCurrent,
      });
      continue;
    }

    // The live month is "as of now", not as of a period end that hasn't arrived.
    const asOf = isCurrent ? now : range.end;
    points.push({
      key,
      label,
      date: asOf,
      ...netWorthAt(input.accounts, input.transactions, asOf),
      source: 'reconstructed',
      isCurrent,
    });
  }

  return points;
}

export interface SnapshotPlanInput {
  accounts: Account[];
  transactions: Transaction[];
  snapshots: NetWorthSnapshot[];
  now?: Date;
  monthStartDay?: number;
  /** How many missing past months this pass may fill in. */
  maxBackfill?: number;
}

/** A snapshot with its store-assigned fields still to come. */
export type PlannedSnapshot = Omit<NetWorthSnapshot, 'id' | 'createdAt'>;

/**
 * Snapshots that are missing for completed financial months, oldest first.
 *
 * Only *closed* months are captured — the month in progress has no final value yet. The walk
 * stops once it reaches back past the oldest transaction, so a fresh install with no history
 * doesn't manufacture a run of identical zero months.
 */
export function planNetWorthSnapshots(input: SnapshotPlanInput): PlannedSnapshot[] {
  const now = input.now ?? new Date();
  const monthStartDay = input.monthStartDay ?? DEFAULT_MONTH_START_DAY;
  const maxBackfill = Math.max(0, input.maxBackfill ?? MAX_SNAPSHOT_BACKFILL);
  if (maxBackfill === 0 || input.accounts.length === 0) return [];

  const existing = new Set(input.snapshots.map((s) => s.periodKey));
  const earliest = earliestTransactionTime(input.transactions);
  if (earliest === null) return [];

  const current = periodRange('monthly', now, monthStartDay);
  const planned: PlannedSnapshot[] = [];

  for (let i = 1; i <= maxBackfill; i += 1) {
    const range: PeriodRange = shiftPeriod(current, -i);
    // Nothing had happened yet, so there is no meaningful net worth to freeze.
    if (range.end.getTime() < earliest) break;

    const key = format(range.start, 'yyyy-MM');
    if (existing.has(key)) continue;

    const { assets, liabilities } = netWorthAt(input.accounts, input.transactions, range.end);
    planned.push({
      periodKey: key,
      date: range.end.toISOString(),
      assets,
      liabilities,
    });
  }

  return planned.reverse();
}

function earliestTransactionTime(transactions: Transaction[]): number | null {
  let earliest: number | null = null;
  for (const t of transactions) {
    const time = parseISO(t.date).getTime();
    if (Number.isNaN(time)) continue;
    if (earliest === null || time < earliest) earliest = time;
  }
  return earliest;
}
