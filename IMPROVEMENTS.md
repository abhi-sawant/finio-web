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

- [x] **[M] Local notifications.** Fixed: reminders for recurring bills coming due, budgets
  crossing `BUDGET_NEAR_LIMIT_PERCENT` or going over, and credit card statement payments.
  [`src/utils/notificationSchedule.ts`](src/utils/notificationSchedule.ts) is a pure, `now`-taking
  builder that reuses `futureOccurrences`, `computeBudgetStatuses` + `budgetHealth` and
  `getCreditCardDueInfo` rather than reimplementing any of them. The schedule is rebuilt from
  scratch on every app open, so an id has to come out identical each time — that stability *is*
  the dedupe contract. Ids key on the occurrence (the due date, or `range.start` for a budget
  period) and never on the fire time, so changing the lead time can't re-send a reminder and a
  budget re-arms by itself when the period rolls; severity is in the budget key, so `near` →
  `over` is a second reminder rather than a swallowed one. A missed lead window clamps forward to
  now (late beats lost) and `MAX_NOTIFICATIONS_PER_RUN` keeps a month away from becoming a wall of
  banners. Bodies honour `hideAmounts`, which is exactly what a lock-screen preview is for.
  Schedule and fired-ledger live in IndexedDB
  ([`src/services/notificationDb.ts`](src/services/notificationDb.ts)) rather than the store: a
  service worker cannot touch localStorage, so a ledger there would let the two contexts re-fire
  each other's reminders, and the backup payload spreads the whole store so it would bloat every
  export. `claimFired` leans on IDB `add()` rejecting a duplicate key, making the claim atomic —
  which also covers StrictMode. Persisted schema v13 adds five flat settings: master off
  (permission must be asked for behind a tap) with the per-trigger switches on.
  **Background delivery** came with the service-worker switch below; without it, and on iOS and
  Firefox always, reminders arrive on the next app open and the Settings copy says exactly that.
- [x] **[S] Manifest shortcuts + Web Share Target.** Fixed: four shortcuts (Add Expense, Add
  Income, Transactions, Budgets) and a `share_target` at `/share-target`.
  `method: 'GET'` is forced rather than preferred — `public/.htaccess` rewrites to a static
  `index.html` and cannot take a POST body, and a POST target also needs the SW to already be
  controlling, which it isn't on a cold-start share from a fresh install.
  [`src/utils/shareTarget.ts`](src/utils/shareTarget.ts) is the pure parser: `extractAmount` only
  accepts a number sitting next to a currency marker, which is the whole guard against a payment
  SMS — `"A/c XX1234 debited by Rs 99.00"` has two plausible numbers and only one is money.
  `AddTransaction` seeds itself in its `useState` initializers rather than a mount effect, because
  `setNote` alone doesn't run categorization rules; seeding `appliedRule` from `findMatchingRule`
  makes the existing "Filed as Food by your rule / Undo" banner appear, so a shared transaction is
  categorized as visibly and reversibly as a typed one. All three `navigate(-1)` sites became a
  `goBack()` that checks `history.state.idx` — a cold start from a shortcut, share or notification
  has nothing behind it, and going back would drop the user out of the PWA.
- [x] **[M] Custom service worker + periodic background sync.** (Not originally listed; the
  notifications item needs it.) `vite-plugin-pwa` moved from `generateSW` to `injectManifest` with
  a hand-written [`src/sw/sw.ts`](src/sw/sw.ts), because `generateSW` cannot host a `periodicsync`
  handler. The migration is mostly about *not* losing what the generated worker did for free:
  `runtimeCaching`, `navigateFallback`, `cleanupOutdatedCaches` and `clientsClaim` are all
  `generateSW`-only options that `injectManifest` **ignores silently, with no error**. The one that
  matters is the navigation fallback — without a hand-written `NavigationRoute`, offline
  deep-links to `/settings` or `/budgets` 404, a regression with nothing to do with notifications.
  `registerType: 'autoUpdate'` additionally needs `skipWaiting()`/`clientsClaim()` literally in the
  source or updates stall behind a waiting worker. The worker gets its own TS project
  (`tsconfig.sw.json` in the root references, `src/sw` excluded from `tsconfig.app.json` — missing
  either half fails the build) since it needs the WebWorker lib while the app needs DOM. The
  `workbox-*` runtime packages became explicit devDeps; they had been resolving only through npm
  hoisting `workbox-build`.
- [x] **[M] App lock.** Fixed: a PIN gate in front of the app, an optional WebAuthn platform
  authenticator for biometric unlock, and auto-lock after a configurable time in the background.
  It is a **screen gate, not encryption**, and the UI says so where the user can see it — the data
  behind it is still plaintext in localStorage. Lock state lives in a new `finio-lock` store
  ([`src/store/useAppLockStore.ts`](src/store/useAppLockStore.ts)) rather than on `Settings`, and
  that is load-bearing: `services/backup.ts` serializes settings into every export and cloud
  upload, so a PIN hash there would travel off-device, and restoring that backup elsewhere would
  silently install this device's PIN on it. Separate stores make both impossible with no scrubbing
  code, and mean `resetToDefaults()` can't unlock the app either. The cold-start decision sits in
  `onRehydrateStorage`, not an effect — localStorage is synchronous, so it lands before the first
  render (no flash of balances) and StrictMode can't double-fire it. `shouldLockOnResume` fails
  closed on a missing timestamp, since iOS doesn't reliably fire `pagehide` when it kills a
  backgrounded PWA. [`src/utils/pinCrypto.ts`](src/utils/pinCrypto.ts) is PBKDF2-SHA256 at 310k
  iterations and is candid about what that buys: a 4-digit PIN is 10⁴ candidates, so hashing
  doesn't make it unguessable and no count would — it stops the PIN sitting in plaintext, nothing
  more. WebAuthn is a convenience unlock and never a second factor (no server means the challenge
  is client-generated and unverifiable), but `userVerification: 'required'` still makes the OS
  demand a face or finger, and the UV flag is checked rather than assumed. Failed attempts get a
  persisted 15s–5min backoff ladder; there is deliberately **no** wipe-after-N-attempts, which in
  a local-only app would turn a forgotten PIN into unrecoverable loss. Recovery is stated honestly
  instead, and the set-PIN dialog nudges toward a backup first. Deep links survive the gate for
  free — it renders above `<Routes>` and nothing on that path touches the URL.

### Strategic

- [ ] **[M] End-to-end encrypted cloud backup.** The app is positioned as privacy-first, but
  `uploadBackup` sends the complete financial history to the server as plaintext JSON.
  Passphrase-derived key via WebCrypto, encrypt before upload, server stores an opaque blob.
  Contained change (`backup.ts` plus key-management UI) that turns a marketing claim into a
  verifiable property.

---

## 4. Accessibility & quality

- [x] **[S]** The custom toggle switch in Settings has no keyboard focus ring and no label
  association. Fixed: the hand-rolled toggle was copy-pasted across five call sites (Settings,
  Budgets, Category Rules, and twice in Import CSV — one of them a `role="switch"` `<span>` nested
  inside a `<button>`, which is neither focusable nor valid). All five now use
  [`src/components/ui/switch.tsx`](src/components/ui/switch.tsx): `Switch` is a real
  `<button role="switch">` carrying the same `focus-visible:ring-3` treatment as `Button` and
  `Checkbox`, and `SwitchField` renders the labelled row, wiring the title and description to the
  control with `aria-labelledby` / `aria-describedby` — the association a `<label htmlFor>` can't
  give a button. Rows that used to be one big tappable card keep that hit target via
  `interactiveRow`, with the switch still the only focusable thing in them.
- [x] **[S]** Budget and transaction status is communicated by color alone (rose/emerald) with no
  text or icon alternative. Fixed: `budgetHealth()` in
  [`src/utils/calculations.ts`](src/utils/calculations.ts) turns a `BudgetStatus` into a named
  level (`over` / `near` / `ok`), and `BUDGET_NEAR_LIMIT_PERCENT` is now the single threshold both
  the Dashboard's alert card and the Budgets page bar read — they previously disagreed (85 vs 80).
  [`BudgetHealthBadge`](src/components/budgets/BudgetHealthBadge.tsx) says "Over budget" /
  "Near limit" / "On track" with an icon on every budget card (Budgets page and both Dashboard
  cards), and `BudgetProgressBar` makes the bar a real `progressbar` whose `aria-valuetext` reads
  "₹2,000 of ₹2,200 spent" instead of a bare percentage. Budget history rows gained a
  within/over icon. On a transaction row the tint was the only cue for a transfer (which has no
  `+`/`−` sign either), so the amount now carries an `sr-only` "Income:" / "Expense:" /
  "Transfer:" prefix.
- [x] **[S]** Charts have no text alternative or data table fallback for screen readers. Fixed:
  [`ChartDataTable`](src/components/charts/ChartDataTable.tsx) renders the figures behind a chart
  as a real `<table>` inside a "View data table" disclosure — a fallback for assistive tech that
  doubles as a feature for anyone who wants the numbers rather than the picture. It's wired into
  every chart whose data lived only in the SVG: balance trend, income vs expenses, the cash-flow
  forecast, net worth over time, and the spending calendar. `sampleForTable()`
  ([`src/utils/chartTable.ts`](src/utils/chartTable.ts)) thins a 90-day daily series to 24 rows,
  always keeping the endpoints and saying so in the caption. The two charts that were already
  text — the spending donut and the label bars — instead got `role="img"` summaries, list
  semantics and `aria-hidden` on their decorative swatches, so their legend isn't announced
  twice. Heatmap cells carried their total in a `title`, which is mouse-only; each in-range day
  now has an `sr-only` sentence as well.
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
   derived-balance model, all of which had already landed.
7. ~~**Accessibility & quality** (section 4) — switch semantics, status not by colour alone, chart
   data tables.~~ **Done**, and it depended on nothing pending: it touches presentation only, so it
   was independent of the platform/PWA and encrypted-backup work still open in section 3. Section 4
   is now fully checked off.
8. ~~**Platform / PWA** — local notifications, manifest shortcuts + Web Share Target, app lock.~~
   **Done**, and none of it was blocked either: it built on the recurring engine,
   `computeBudgetStatuses`, `getCreditCardDueInfo` and `period.ts`, all long landed. What the
   group *did* need was a platform layer that didn't exist — there was no custom service worker,
   and no use of `Notification`, WebAuthn, `crypto.subtle` or `visibilitychange` anywhere in
   `src/`. Order mattered internally: shortcuts and the share target first (config and prefill
   only, no SW), then reminders on the existing generated worker, then the `injectManifest`
   migration as its own commit so the riskiest change — losing the offline navigation fallback —
   could be reverted alone, and the app lock last, since its gate has to wrap the deep-link entry
   points the first two commits added.

   **What remains is the strategic end-to-end-encrypted backup item.** It is now the only open
   entry in the whole backlog. Worth noting it is *adjacent* to the app lock but not continuous
   with it: the lock is a UI gate over plaintext local data, whereas E2E backup is about the
   payload leaving the device. They share only `crypto.subtle` and the base64url helpers in
   [`src/utils/pinCrypto.ts`](src/utils/pinCrypto.ts), which the passphrase-derived key can reuse.
