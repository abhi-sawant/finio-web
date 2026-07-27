import type { Account, ImportedAccount, Transaction } from '@/types';

/**
 * Balance model
 * -------------
 * `Account.openingBalance` is the immutable starting point; `Account.balance` is a cache of
 * `openingBalance + Σ(deltas of every transaction touching the account)`. Keeping the opening
 * balance around is what makes a balance *derivable*, so any drift (a bad import, a partial
 * delete, a manual edit) can be reconciled instead of being permanent and invisible.
 */

/** The only fields of a transaction that can move an account balance. */
export type BalanceTx = Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'amount'>;

/** Round to paise. Repeated float deltas otherwise drift into 12345.670000001. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Apply (direction 1) or reverse (direction -1) a single transaction's effect on balances.
 * Transfers move both sides atomically.
 */
export function applyBalanceDelta(
  accounts: Account[],
  tx: BalanceTx,
  direction: 1 | -1,
): Account[] {
  return accounts.map((account) => {
    if (tx.type === 'expense' && account.id === tx.accountId) {
      return { ...account, balance: roundMoney(account.balance - direction * tx.amount) };
    }
    if (tx.type === 'income' && account.id === tx.accountId) {
      return { ...account, balance: roundMoney(account.balance + direction * tx.amount) };
    }
    if (tx.type === 'transfer') {
      if (account.id === tx.accountId) {
        return { ...account, balance: roundMoney(account.balance - direction * tx.amount) };
      }
      if (tx.toAccountId && account.id === tx.toAccountId) {
        return { ...account, balance: roundMoney(account.balance + direction * tx.amount) };
      }
    }
    return account;
  });
}

/** Net effect of `transactions` on each account, keyed by account id. */
export function sumTransactionDeltas(transactions: BalanceTx[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (id: string, amount: number) => deltas.set(id, (deltas.get(id) ?? 0) + amount);

  for (const tx of transactions) {
    if (!tx || typeof tx.amount !== 'number' || !Number.isFinite(tx.amount)) continue;
    if (tx.type === 'expense') {
      add(tx.accountId, -tx.amount);
    } else if (tx.type === 'income') {
      add(tx.accountId, tx.amount);
    } else if (tx.type === 'transfer') {
      add(tx.accountId, -tx.amount);
      if (tx.toAccountId) add(tx.toAccountId, tx.amount);
    }
  }
  return deltas;
}

function withOpeningBalances(accounts: ImportedAccount[], deltas: Map<string, number>): Account[] {
  return accounts.map((account) => {
    if (typeof account.openingBalance === 'number' && Number.isFinite(account.openingBalance)) {
      return account as Account;
    }
    // Trust the stored balance and work backwards, so the migration is a no-op for
    // anyone whose balances are already correct.
    const balance = Number.isFinite(account.balance) ? account.balance : 0;
    return { ...account, openingBalance: roundMoney(balance - (deltas.get(account.id) ?? 0)) };
  });
}

/**
 * Fill in `openingBalance` for accounts that don't have one, derived from the current
 * balance minus the transactions that produced it. Accounts that already have an opening
 * balance are returned untouched.
 */
export function backfillOpeningBalances(
  accounts: ImportedAccount[],
  transactions: BalanceTx[],
): Account[] {
  return withOpeningBalances(accounts, sumTransactionDeltas(transactions));
}

/** Recompute every `balance` from `openingBalance` + transactions. The reconcile primitive. */
export function recomputeAccountBalances(
  accounts: ImportedAccount[],
  transactions: BalanceTx[],
): Account[] {
  const deltas = sumTransactionDeltas(transactions);
  return withOpeningBalances(accounts, deltas).map((account) => {
    const balance = roundMoney(account.openingBalance + (deltas.get(account.id) ?? 0));
    return balance === account.balance ? account : { ...account, balance };
  });
}

/** How many accounts a recompute would move, and by how much in total. */
export function diffBalances(
  before: ImportedAccount[],
  after: ImportedAccount[],
): { changed: number; totalDrift: number } {
  const previous = new Map(before.map((a) => [a.id, a.balance]));
  let changed = 0;
  let totalDrift = 0;
  for (const account of after) {
    const old = previous.get(account.id);
    if (old === undefined || old === account.balance) continue;
    changed += 1;
    totalDrift = roundMoney(totalDrift + (account.balance - old));
  }
  return { changed, totalDrift };
}
