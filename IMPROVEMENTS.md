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

- [x] **[M] Savings goals.** Fixed: `Goal { name, icon, color, targetAmount, targetDate?,
  linkedAccountId? }` sits beside `Budget`, and `GoalContribution` is the goal's own manual
  ledger (add/withdraw), independent of accounts and transactions — so it can't corrupt real
  balances. [`src/utils/calculations.ts`](src/utils/calculations.ts) gained `computeGoalStatus`
  (current/remaining/percent, plus a projected completion date paced by the average daily
  contribution since creation). The [Goals page](src/pages/Goals.tsx) reuses the Budgets page's
  progress-bar card pattern, with expandable contribution history (delete + undo). The Dashboard
  gained a "Savings Goals" card for in-progress goals, mirroring the Upcoming Bills pattern.
  Deleting an account clears `linkedAccountId` from any goal pointing at it rather than orphaning
  the reference. Backup export/import (local, cloud, and validation) all carry goals and
  contributions — this also fixed a pre-existing gap where `templates` wasn't included in either
  backup payload.
- [x] **[M] Debt / lending tracker.** Fixed: `Person { name, icon, color }` sits beside `Goal`, and
  `DebtEntry { personId, amount, date, note }` is the person's own manual ledger — signed (positive
  = they owe you more, negative = you owe them more) and, like `GoalContribution`, independent of
  accounts and transactions, so logging "I lent ₹500" can never corrupt a real balance.
  [`src/utils/calculations.ts`](src/utils/calculations.ts) gained `computePersonBalance` plus
  `getTotalOwedToYou`/`getTotalYouOwe`. The [Debts page](src/pages/Debts.tsx) reuses the Goals
  page's card pattern — per-person balance, expandable entry history (delete + undo) — with **They
  owe me** / **I owe them** buttons to log an entry. **Settle up** is the one moment real money
  changes hands: it prompts for an amount and an account, then atomically creates a real
  transaction (income if they owed you, expense if you owed them) via `addTransaction` and a
  balancing `DebtEntry` stamped with `settledTransactionId`, so the repayment shows up in the
  account's real history while the person's ledger nets back toward zero. The Dashboard gained a
  "Debts & Lending" card for the biggest open balances, mirroring the Savings Goals card. Deleting
  a person cascades their debt entries, same as deleting a goal cascades its contributions. Backup
  export/import (local, cloud, and validation) carry people and debt entries alongside every other
  entity, persisted-schema v10.
- [x] **[L] Split transactions.** Fixed: `Transaction.splits?: TransactionSplit[]` allows one
  expense across multiple categories. Every aggregation routes through a new
  `transactionCategoryAmounts()` helper so splits are counted correctly in budgets (only the
  matching portion toward category budgets, full amount toward overall/label budgets), dashboard
  top-category, spending donut, search, and CSV export. Category deletion reassigns/merges split
  entries; bulk recategorize flattens back to a single category. Add/Edit Transaction gained a
  Split toggle with per-row category/amount, add-row/remove-row buttons, and a live allocation
  indicator ("fully allocated" / "₹X left to allocate" / "₹X over"). Transactions list shows
  split transactions with a split icon and joined category names ("Food + Housing") instead of a
  single category. Import validation drops malformed/mismatched splits (falls back to unsplit) rather
  than rejecting the whole row. No persisted-schema bump needed (optional field on new data).
- [x] **[M] CSV / bank statement import with column mapping.** Fixed:
  [`src/utils/csvImport.ts`](src/utils/csvImport.ts) is a pure, testable module — `parseCsvText`
  (papaparse under the hood, handles quoted/embedded commas and a configurable "skip N rows"
  offset for statements with a title block before the real header), `detectDateFormat` /
  `parseDateWithFormat` (six common layouts), `parseAmount` (currency symbols, thousand
  separators, accounting-style parentheses as negative), `buildTransactionsFromCsv` (maps either
  a single signed amount column or separate debit/credit columns, plus an optional category
  column matched by name with a Miscellaneous fallback) and `findDuplicateRows` (same day + type
  + amount + note, against both existing transactions and other rows in the same file). The new
  [Import CSV page](src/pages/ImportCsv.tsx), reached from Settings' Data section, is a three-step
  wizard — upload → map columns (with live auto-detection of the date/amount/note columns and
  date format) → review, where a dry-run preview lists every accepted row, flags duplicates with
  a toggle to skip them, and surfaces rejected rows the same way the JSON import's preview dialog
  does. Confirming calls a new `bulkAddTransactions` store action (single balance-delta pass over
  every row, mirroring how `processRecurring` inserts a batch). No persisted-schema bump — it's a
  new store method, not a state shape change.
- [x] **[M] Auto-categorization rules.** Fixed: `CategoryRule { pattern, matchType, scope,
  categoryId, labelIds, enabled }` is a new store collection (persisted-schema v11, seeded empty
  so nothing is recategorized on upgrade) whose array order *is* its priority — first enabled
  match wins. [`src/utils/autoCategorize.ts`](src/utils/autoCategorize.ts) is the pure engine:
  `ruleMatches`/`findMatchingRule` (contains / starts with / ends with / is exactly / regex, all
  case-insensitive, with an unparseable regex treated as matching nothing rather than throwing),
  `mergeLabels` (a rule's labels are additive, never a replacement) and `planRuleApplication`,
  which compiles each pattern once and returns only the rows that would actually move. Two
  invariants hold everywhere: a rule never fires on a transfer, and never flattens a split.
  Rules run in three places — Add Transaction applies one live as you type the note, showing
  "Filed as Transport by your 'Uber' rule" with an Undo, and backs itself out if the note stops
  matching (it never fires while editing an existing transaction, or once you've touched the
  category picker yourself); `buildTransactionsFromCsv` applies them during import, but only to
  rows the statement's own category column didn't already claim, and the review step flags each
  rule-categorized row; and the [Rules page](src/pages/CategoryRules.tsx) can replay them over
  existing history — "uncategorized only" or "all transactions" — with a live count of what would
  change and a single-toast undo via `restoreCategorization`. Deleting a category repoints its
  rules at Miscellaneous and deleting a label strips it from every rule, same as the existing
  cascades. Backup export/import and validation carry rules like every other entity.

### Quick wins

- [x] **[S] Transaction templates / duplicate.** Fixed: long-press a transaction row (context menu
  on desktop too, via a pointer-based long-press) opens **Select**, **Duplicate**, **Save as
  template** and **Delete**. Duplicate re-adds the transaction dated today via `addTransaction`,
  toast + undo. Templates are a new `TransactionTemplate` store collection (persisted-schema v8,
  round-trips through backup import/export like every other entity) with `addTemplate`/
  `deleteTemplate`. Long-pressing the FAB opens a popover of saved templates — tapping one is the
  "one-tap add", also toast + undo.
- [x] **[S] Bulk actions.** Fixed: the row context menu's **Select** action enters a selection mode
  on the Transactions page — checkboxes replace navigate-on-tap, and a bottom action bar shows
  **N selected** with **Add label**, **Recategorize**, **Delete** (toast + undo, restoring every
  removed row) and **Cancel**. New store actions: `bulkDeleteTransactions`/`restoreTransactions`,
  `bulkRecategorize`, `bulkAddLabel` (adds without duplicating a label a transaction already has).
- [x] **[S] Hide-amounts toggle.** Fixed: `Settings.hideAmounts` (persisted-schema v8) plus a
  `hidden` param on `formatCurrency` that masks to `₹••••` (sign kept, magnitude hidden). An eye/
  eye-off icon button — [`HideAmountsToggle`](src/components/HideAmountsToggle.tsx) — sits in the
  header of every data-bearing page (Dashboard, Accounts, Transactions, Analytics, Budgets,
  Recurring) and masks every stat tile, list row, card and chart tooltip app-wide.

### Analytics depth

- [x] **[M] Cash-flow forecast.** Fixed: [`src/utils/forecast.ts`](src/utils/forecast.ts) projects
  *liquid* cash (open, non-credit accounts) forward day by day from two inputs — future recurring
  occurrences via a new `futureOccurrences()` in [`src/store/recurring.ts`](src/store/recurring.ts)
  (the forward-looking counterpart to `planRecurring`, which honours pause / `endDate` /
  `maxOccurrences` and never returns the overdue backlog), plus `categoryDailyAverages()` for
  everyday spend. The two halves can't double-count: the average excludes rows carrying a
  `recurringId`, and `liquidDelta()` decides what actually moves cash — card spending is worth zero
  until the payment transfer happens, and an internal transfer nets out. The average divides by the
  history that exists rather than the whole 90-day window, so a two-week-old install isn't read as
  spending a tenth of what it does. The Analytics card charts 30/60/90 days with today's balance,
  the projected end balance, the low point, the scheduled bills next up, and a warning naming the
  date the balance would run out.
- [x] **[M] Net worth over time.** Fixed: `NetWorthSnapshot { periodKey, date, assets, liabilities }`
  is a new store collection (persisted-schema v12, seeded empty). Balances here are derived, so any
  past value can be reconstructed by rewinding today's accounts through today's transactions — and
  that reconstruction silently rewrites itself the moment old history is edited. So
  [`src/utils/netWorth.ts`](src/utils/netWorth.ts) freezes each financial month as it closes:
  `planNetWorthSnapshots()` captures only *completed* months, never reaches back past the first
  transaction, and runs from a `Layout` mount effect after recurring processing.
  `buildNetWorthSeries()` prefers a snapshot per month and falls back to `netWorthAt()`
  reconstruction, marking which is which; the current month is always live. Snapshots round-trip
  through backup export/import and validation (a malformed `periodKey` is rejected outright — a
  point on the wrong month is worse than a missing one), and `importData` dedupes by period key
  since ids are unique but the month is the real identity.
- [x] **[S] Spending calendar heatmap.** Fixed: `buildSpendingCalendar()` in
  [`src/utils/analytics.ts`](src/utils/analytics.ts) buckets daily expense totals into Monday-first
  week rows, padding the leading/trailing days so every row is full. Intensity is square-rooted
  against the heaviest day, so one month-end rent payment doesn't flatten every ordinary day to
  invisible. The card navigates month by month through history, dims future days, rings today, and
  reports total / average-per-spending-day / busiest day underneath.
- [x] **[M] Insights feed.** Fixed: [`src/utils/insights.ts`](src/utils/insights.ts) derives
  everything on the fly — categories running above (or below) their own 3-month average, budgets
  over or on pace to go over, an unhealthy or healthy savings rate, and one category dominating the
  month. Current-month figures are pace-adjusted, or a month that is three days old reads as a
  collapse in spending. `detectSubscriptions()` groups expenses by a normalized note ("UPI/Spotify/9921"
  and "Spotify 449" land together), requires three-plus charges at a near-identical amount on a
  weekly/monthly/yearly cadence, and skips anything an existing recurring rule already covers; the
  candidate's `nextDate` is always in the future, so accepting the offered rule can't backfill
  charges already in the ledger. Insight copy carries no money of its own — the caller passes a
  `formatAmount`, which is how the feed honours the hide-amounts toggle.
- [x] **[S] Compare periods.** Fixed: `buildPeriodComparison()` lines up this period, the previous
  one and the same one a year ago (weekly / monthly / yearly, all following `monthStartDay`), with
  `categoryMovements()` ranking the biggest swings against last period. The in-progress period is
  labelled as such and shows what it's on pace for, so a half-finished month is never silently
  compared against whole ones.

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
2. ~~**One flagship**: savings goals if the app should feel more complete, or CSV import +
   auto-categorization if new-user onboarding matters more.~~ **Done** — every flagship candidate
   has landed.
3. ~~**Backup history UI** — nearly free, the backend already supports it.~~ **Done.**
4. ~~**Section 2 quick wins** — search breadth, `AlertDialog` instead of `confirm()`, archive
   accounts.~~ **Done**, plus onboarding.
5. ~~**Period work** — custom month start day, budget periods/rollover/history, recurring rule
   lifecycle.~~ **Done.** The month start day landed first because budget periods are built on the
   same `period.ts` engine. Sections 1 and 2 are now fully checked off.
6. ~~**Analytics depth** — forecast, net worth over time, heatmap, insights, compare periods.~~
   **Done.** Nothing in it was blocked: it built on `period.ts`, the recurring engine and the
   derived-balance model, all of which had already landed. What remains is section 3's platform/PWA
   group, the strategic encrypted-backup item, and the three accessibility items in section 4 —
   note that the two new charts (forecast, net worth) ship with `aria-label` summaries and the
   heatmap labels every cell with its date, so they don't add to the charts-need-text-alternatives
   debt, but they don't close it either.
