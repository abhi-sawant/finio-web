# Finio — Improvement Backlog

A working reference of everything worth fixing or building, derived from a full read of `src/`
(stores, calculations, all pages, services) on 2026-07-27.

Legend: **[S]** small (hours) · **[M]** medium (a day or two) · **[L]** large (multi-day, schema change)

Checked items have landed on `main`.

---

## 1. Bugs & correctness

These are defects in a money app — they should land before any new feature work.

- [x] **[S] `formatCurrency` ignores its `_compact` flag.** [`src/utils/formatters.ts:17`](src/utils/formatters.ts)
  takes `_compact` and never reads it. 19 call sites pass `true` (Dashboard, Accounts, Analytics,
  Recurring, AccountCard, SpendingDonut, LabelSpendingBar) expecting `₹1.2L` / `$1.2K` and get the
  full number, which overflows the hero card and stat tiles on narrow screens.

- [x] **[S] `deleteAccount` corrupts other accounts' balances.**
  [`src/store/useFinanceStore.ts:104`](src/store/useFinanceStore.ts) removes the account and its
  transactions but never reverses their balance deltas. Deleting account A that had transfers into
  B leaves B permanently inflated. Must `applyBalanceDelta(..., -1)` over every removed transaction
  before dropping it.

- [x] **[S] `deleteCategory` orphans transactions and recurring rules.**
  [`src/store/useFinanceStore.ts:170`](src/store/useFinanceStore.ts) filters `budgets` but leaves
  `transaction.categoryId` and `recurring.categoryId` dangling. Those rows render as "Unknown" and
  silently drop out of the spending donut. Needs a fallback reassignment (Miscellaneous) or a
  reassign-to prompt.

- [x] **[S] Transactions page prints a raw number.**
  [`src/pages/Transactions.tsx:182`](src/pages/Transactions.tsx) renders
  `{currency} {totalIncome}` → `INR 12345.670000001`, bypassing `formatCurrency`. It also shows
  only whichever of income/expense is larger, hiding the other.

- [x] **[S] `savingsRate` is clamped to zero.**
  [`src/utils/calculations.ts:154`](src/utils/calculations.ts) uses `Math.max(0, ...)`, so a month
  where you overspend your income reads as "0% savings rate" instead of negative — exactly the
  months where the number matters most.

- [x] ~~**[S] `formatInputAmount` hardcodes `en-IN` grouping.**~~ Moot: the app is INR-only, so
  Indian-system grouping is now correct by definition.

- [x] **[S] `processRecurring` shares one 365-generation cap across all rules.**
  [`src/store/useFinanceStore.ts:249`](src/store/useFinanceStore.ts) declares `generated` outside
  the rule loop, so one long-overdue daily rule consumes the whole budget and every later rule
  generates exactly one occurrence per app open. Self-heals across launches, but the cap should be
  per-rule.

- [x] **[S] `ProtectedRoute` is dead code.** [`src/components/ProtectedRoute.tsx`](src/components/ProtectedRoute.tsx)
  is imported by nothing. Correct for an offline-first app where auth is optional — just delete it.

- [x] **[M] Import replaces everything with almost no validation.**
  Fixed: [`src/utils/importValidation.ts`](src/utils/importValidation.ts) shape-validates every
  row (types, finite amounts, parseable dates, transfer destinations, duplicate ids) and returns a
  report; [`src/pages/Settings.tsx`](src/pages/Settings.tsx) shows it as a dry-run preview dialog
  with per-entity accepted/skipped counts and referential warnings, then offers **Merge** (union by
  id) or **Replace**. Rejected rows are dropped and counted; orphan references are kept and warned
  about. Balances are recomputed after either mode, and cloud restores go through the same
  validation.

- [x] ~~**[L] Multi-currency is decorative.**~~ **Resolved by removing the feature.** The app is
  now INR-only: `Currency`, `Account.currency`, `Settings.currency`, and the Settings currency
  selector are gone; `formatCurrency` hardcodes INR/`en-IN`. Persisted schema bumped to v4, which
  strips the legacy `currency` key from stored settings and accounts (and from imported backups).

- [x] **[L] Balances cannot be recomputed.** Fixed: `Account.openingBalance` is now the source of
  truth and `balance` is a recomputable cache of `openingBalance + Σ(transaction deltas)`.
  Persisted schema v5 seeds `openingBalance = balance − Σ(deltas)`, so existing balances are
  preserved exactly and become derivable from that point on. New primitives live in
  [`src/store/balance.ts`](src/store/balance.ts) (`recomputeAccountBalances`,
  `backfillOpeningBalances`, `diffBalances`, plus paise rounding on every delta); the store exposes
  `recomputeBalances()` and Settings has a **Reconcile Balances** action that reports how many
  accounts moved and the net drift corrected. Editing an account's current balance shifts its
  opening balance so the invariant holds.

- [x] **[S] No tests anywhere.** Fixed: Vitest added (`npm test`), with the money-critical logic
  extracted into pure, testable modules — [`src/store/balance.ts`](src/store/balance.ts) and
  [`src/store/recurring.ts`](src/store/recurring.ts) (`planRecurring` is now a pure planner the
  store just applies). 55 tests cover `applyBalanceDelta` (including transfers and rounding),
  balance recompute/backfill, the per-rule recurring cap, `computeBudgetStatuses`, `savingsRate`,
  backup validation, and the store itself (import merge/replace, `deleteAccount` transfer reversal,
  and a balance-neutral v5 migration).

---

## 2. Gaps in existing features

- [x] **[S] Search is too narrow.** Fixed: matching moved into a pure
  `transactionMatchesQuery(tx, query, index)` in [`src/utils/calculations.ts`](src/utils/calculations.ts)
  and now covers note, category, both sides of a transfer's accounts, labels, and amount.
  Amount matching strips grouping and currency symbols, so `₹1,200` finds `1200`.
- [x] **[M] Recurring rules can only be created and deleted.** Fixed: rules now have a full
  lifecycle. [`src/store/recurring.ts`](src/store/recurring.ts) gained `pausedAt`, `endDate`,
  `maxOccurrences`/`occurrenceCount` and transfer support (a transfer rule needs both accounts to
  still exist), plus `nextDueDate`, `isRuleFinished` and `lastOccurrenceOnOrBefore`. The Recurring
  page edits a rule in place, pauses/resumes it, and shows next-due / "3 of 12" / "until 31 Dec" on
  each card. A rule dated in the past no longer injects transactions silently: `previewBackfill()`
  feeds a dialog that names the count, the total and the first date, and offers **Add them**,
  **Start from today** (parks `lastRunDate` on the last past occurrence, keeping the cadence
  anchored to `startDate`) or **Cancel**. The Dashboard's upcoming-bills card reuses `nextDueDate`
  so paused and finished rules drop out of it.
- [x] **[M] Budgets are monthly-only.** Fixed: `Budget` gained `period` (weekly/monthly/yearly),
  `rollover` and `labelId`. Statuses come from
  `computeBudgetStatuses(budgets, transactions, { monthStartDay })`, which slices each budget by its
  own period; rollover carries the previous period's balance forward — signed, so an overspend
  carries as a debt — over at most `MAX_ROLLOVER_LOOKBACK` periods and never past the budget's
  creation. `computeBudgetHistory()` answers "did I hit it last month?" and renders as a collapsible
  per-period bar list on each card. Budgets are also editable now, and one limit per scope
  (`budgetScopeKey`) keeps overall / category / label budgets from double-counting.
- [x] **[S] Custom month start day.** Fixed: `Settings.monthStartDay` (1–28) drives a new
  [`src/utils/period.ts`](src/utils/period.ts) — `periodRange`, `shiftPeriod`, `periodLabel`,
  day-count helpers — that every month window now goes through: Dashboard totals and daily-average
  pacing, monthly budgets, and the Analytics month/quarter/year filters. Settings picks the day from
  a 28-day grid and shows the resulting cycle ("25 Jul – 24 Aug 2026").
- [x] **[S] Archive accounts instead of deleting.** Fixed: `Account.archivedAt` marks a closed
  account. Transactions, balances and recurring rules survive; the account drops out of every
  running total (`activeAccounts()` in [`src/utils/calculations.ts`](src/utils/calculations.ts)
  gates `getTotalAccountBalance` / `getNetWorth` / `getTotalCreditOutstanding`), out of the
  Dashboard carousel, and out of the account pickers — except on a transaction that already
  sits on it, so editing history can't silently reassign it. The Accounts page shows archived
  accounts in a collapsed section with restore and permanent-delete, and the delete dialog now
  names the transaction count and points at archiving instead.
- [x] **[M] Credit card lifecycle.** Fixed: `Account` gained `statementCloseDay`, `paymentDueDays`
  and `minimumDuePercent` (all optional — existing credit accounts are unaffected until
  configured). [`src/utils/calculations.ts`](src/utils/calculations.ts) gained
  `getCreditUtilization` (shared by both `AccountCard` variants, replacing the old inline
  calculation) and `getCreditCardDueInfo`, which anchors to the most recently passed statement
  close day, projects the due date `paymentDueDays` later, and reports the minimum due as a
  percent of the current outstanding balance (there's no per-statement snapshot, so "outstanding"
  is always today's balance). The Dashboard gained a "Card Payments Due" card mirroring the
  Upcoming Bills pattern — shown whenever a configured due date is within 7 days or overdue — and
  both `AccountCard` variants show a due-date line (red once overdue). `AddAccount`/edit gained a
  "Statement Cycle (optional)" section with close day, due-after-days and minimum-due-percent
  inputs, shown only for credit accounts.
- [x] **[S] Native `confirm()` everywhere.** Fixed: all 11 call sites now go through a
  promise-based `useConfirm()` backed by a single shadcn `AlertDialog`
  ([`src/components/ui/confirm.tsx`](src/components/ui/confirm.tsx)), so `await confirm({...})`
  reads like the old call but is styled, focus-trapped and Escape-cancellable. Each prompt also
  gained a description of what actually happens (category deletes reassign to Miscellaneous,
  signing out keeps local data, and so on). Transaction deletes skip the prompt entirely in
  favour of undo-via-toast, backed by `deleteTransaction` returning the removed row and a new
  `restoreTransaction` that re-inserts it under its original id. Also closes the
  `confirm()`-breaks-focus item in section 4.
- [x] **[S] Onboarding.** Fixed: [`src/components/onboarding/Onboarding.tsx`](src/components/onboarding/Onboarding.tsx)
  is a three-step wizard (name → first account → opening balance) shown in place of the app
  while `settings.onboardedAt` is unset. The "Alex" default is gone. Steps after the name are
  skippable so someone reinstalling can reach Settings and restore a backup without inventing an
  account first, and a credit card's opening balance is entered as an amount owed. Persisted
  schema v6 backdates `onboardedAt` for existing installs so the wizard never appears for them;
  `resetToDefaults` now clears finance data only, so wiping data no longer resets the user's name.

### Backend features with no UI

All of these endpoints are implemented in PHP and wired up in
[`src/services/api.ts`](src/services/api.ts):

- [x] **[S] Backup history** — Fixed: [`src/services/backup.ts`](src/services/backup.ts) gained
  `listCloudBackups`, `restoreBackupByDate` and `deleteCloudBackup` wrappers (restore goes through
  the same `validateBackup()` as every other cloud payload). Settings has a **Backup History**
  dialog listing every version by date and size with per-row **Restore** (confirmed, since it
  replaces local data) and delete.
- [x] **[S] Change password** — Fixed: a **Change Password** dialog in Settings calls
  `api.updateProfile` with `current_password`/`new_password` and stores the refreshed JWT the
  endpoint returns via `setAuth`.
- [x] **[S] Delete cloud account** — Fixed: a **Delete Cloud Account** dialog requires the account
  password (the endpoint's own confirmation), calls `api.deleteAccount`, then clears local auth
  state. Local finance data is unaffected — only the server-side account and its backups go.

---

## 3. New features

### Flagship candidates

- [ ] **[M] Savings goals.** The one big missing entity. `Goal { name, targetAmount, targetDate,
  linkedAccountId, contributions }` sits naturally beside `Budget` and reuses the progress-bar UI
  from the Budgets page. Gives the Dashboard something to track besides spending.
- [ ] **[M] Debt / lending tracker.** The default labels already ship `Lending`, `Obligation`, and
  `For Others` — that's a workaround for a missing feature. A "who owes me / who I owe" ledger with
  per-person balances and a settle-up action that generates the transfer.
- [ ] **[L] Split transactions.** One receipt across multiple categories (groceries + household +
  pharmacy). Needs `Transaction.splits?: {categoryId, amount}[]` and touches every aggregation, but
  it's the difference between roughly categorized and actually accurate.
- [ ] **[M] CSV / bank statement import with column mapping.** Today the only way in is manual entry
  or a Finio JSON restore. Import plus a dedupe pass (date + amount + note) is the biggest adoption
  unlock for anyone with a year of history in their bank's CSV export.
- [ ] **[M] Auto-categorization rules.** `if note contains "Uber" → Transport + Essential`. Runs on
  manual add and, crucially, on CSV import. The existing note-suggestions datalist proves the data
  is there; this makes the import feature genuinely usable.

### Quick wins

- [ ] **[S] Transaction templates / duplicate.** Long-press a transaction → "Duplicate" or "Save as
  template", then one-tap add from the FAB.
- [ ] **[S] Bulk actions.** Multi-select in the transaction list → delete, recategorize, add label.
- [ ] **[S] Hide-amounts toggle.** A blur/eye button in the header. The most-used privacy feature in
  every finance app, and it fits the product positioning.

### Analytics depth

- [ ] **[M] Cash-flow forecast.** Project balances forward from recurring rules plus category
  averages. All the inputs exist; nothing currently looks further ahead than the 7-day bill list.
- [ ] **[M] Net worth over time.** Monthly snapshots so the trend survives history edits.
- [ ] **[S] Spending calendar heatmap.** A month grid with intensity by daily spend. Cheap and very
  readable.
- [ ] **[M] Insights feed.** "Food is 40% above your 3-month average." "Three ₹499 charges from
  'Spotify' — create a recurring rule?" Subscription detection that offers to create the rule is a
  delightful loop given the recurring engine already exists.
- [ ] **[S] Compare periods.** This month vs last vs same month last year, side by side.

### Platform / PWA

- [ ] **[M] Local notifications** for bill due dates and budget threshold breaches. The upcoming-bills
  card only helps if you happen to open the app.
- [ ] **[S] Manifest shortcuts + Web Share Target.** Long-press the icon → "Add Expense" straight to
  the number pad; share a payment SMS into Finio to prefill.
- [ ] **[M] App lock.** PIN or WebAuthn/biometric, plus auto-lock on background. A privacy-first
  finance app with zero local protection is a real gap.
- [ ] **[M] Receipt attachments** in IndexedDB (not localStorage — it will blow the quota). Fits the
  offline-first, nothing-leaves-your-device story.
- [ ] **[S] Command palette + keyboard shortcuts.** A desktop sidebar already ships, so desktop is a
  target surface.

### Strategic

- [ ] **[M] End-to-end encrypted cloud backup.** The app is positioned as privacy-first, but
  `uploadBackup` sends the complete financial history to the server as plaintext JSON.
  Passphrase-derived key via WebCrypto, encrypt before upload, server stores an opaque blob.
  Contained change (`backup.ts` plus key-management UI) that turns a marketing claim into a
  verifiable property.

---

## 4. Accessibility & quality

- [ ] **[S]** The custom toggle switch in Settings has no keyboard focus ring and no label
  association.
- [ ] **[S]** Budget and transaction status is communicated by color alone (rose/emerald) with no
  text or icon alternative.
- [ ] **[S]** Charts have no text alternative or data table fallback for screen readers.
- [x] ~~**[S]** `confirm()` dialogs break focus management on mobile.~~ Resolved by the
  `AlertDialog` migration in section 2.

---

## Suggested sequencing

1. ~~**Bug batch** (section 1) — correctness first, everything else builds on it.~~ **Done:**
   section 1 is fully checked off, including `openingBalance` + reconcile and the Vitest suite.
2. **One flagship**: savings goals if the app should feel more complete, or CSV import +
   auto-categorization if new-user onboarding matters more.
3. **Backup history UI** — nearly free, the backend already supports it.
4. ~~**Section 2 quick wins** — search breadth, `AlertDialog` instead of `confirm()`, archive
   accounts.~~ **Done**, plus onboarding.
5. ~~**Period work** — custom month start day, budget periods/rollover/history, recurring rule
   lifecycle.~~ **Done.** The month start day landed first because budget periods are built on the
   same `period.ts` engine. What remains in section 2 is the credit card lifecycle and the three
   backend-backed UIs.
