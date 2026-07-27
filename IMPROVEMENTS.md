# Finio — Improvement Backlog

A working reference of everything worth fixing or building, derived from a full read of `src/`
(stores, calculations, all pages, services) on 2026-07-27.

Legend: **[S]** small (hours) · **[M]** medium (a day or two) · **[L]** large (multi-day, schema change)

---

## 1. Bugs & correctness

These are defects in a money app — they should land before any new feature work.

- [ ] **[S] `formatCurrency` ignores its `_compact` flag.** [`src/utils/formatters.ts:17`](src/utils/formatters.ts)
  takes `_compact` and never reads it. 19 call sites pass `true` (Dashboard, Accounts, Analytics,
  Recurring, AccountCard, SpendingDonut, LabelSpendingBar) expecting `₹1.2L` / `$1.2K` and get the
  full number, which overflows the hero card and stat tiles on narrow screens.

- [ ] **[S] `deleteAccount` corrupts other accounts' balances.**
  [`src/store/useFinanceStore.ts:104`](src/store/useFinanceStore.ts) removes the account and its
  transactions but never reverses their balance deltas. Deleting account A that had transfers into
  B leaves B permanently inflated. Must `applyBalanceDelta(..., -1)` over every removed transaction
  before dropping it.

- [ ] **[S] `deleteCategory` orphans transactions and recurring rules.**
  [`src/store/useFinanceStore.ts:170`](src/store/useFinanceStore.ts) filters `budgets` but leaves
  `transaction.categoryId` and `recurring.categoryId` dangling. Those rows render as "Unknown" and
  silently drop out of the spending donut. Needs a fallback reassignment (Miscellaneous) or a
  reassign-to prompt.

- [ ] **[S] Transactions page prints a raw number.**
  [`src/pages/Transactions.tsx:182`](src/pages/Transactions.tsx) renders
  `{currency} {totalIncome}` → `INR 12345.670000001`, bypassing `formatCurrency`. It also shows
  only whichever of income/expense is larger, hiding the other.

- [ ] **[S] `savingsRate` is clamped to zero.**
  [`src/utils/calculations.ts:154`](src/utils/calculations.ts) uses `Math.max(0, ...)`, so a month
  where you overspend your income reads as "0% savings rate" instead of negative — exactly the
  months where the number matters most.

- [ ] **[S] `formatInputAmount` hardcodes `en-IN` grouping.**
  [`src/utils/formatters.ts:67`](src/utils/formatters.ts) groups every currency in the Indian
  system, so a USD user typing 122999 into the number pad sees `1,22,999`.

- [ ] **[S] `processRecurring` shares one 365-generation cap across all rules.**
  [`src/store/useFinanceStore.ts:249`](src/store/useFinanceStore.ts) declares `generated` outside
  the rule loop, so one long-overdue daily rule consumes the whole budget and every later rule
  generates exactly one occurrence per app open. Self-heals across launches, but the cap should be
  per-rule.

- [ ] **[S] `ProtectedRoute` is dead code.** [`src/components/ProtectedRoute.tsx`](src/components/ProtectedRoute.tsx)
  is imported by nothing. Correct for an offline-first app where auth is optional — just delete it.

- [ ] **[M] Import replaces everything with almost no validation.**
  [`src/pages/Settings.tsx:140`](src/pages/Settings.tsx) checks only "is this an array" and then
  overwrites all state. No shape validation, no merge option, no dry-run preview, no balance
  recompute afterward.

- [ ] **[L] Multi-currency is decorative.** `Account.currency` is stored per account, but
  [`getTotalAccountBalance`](src/utils/calculations.ts) and `getNetWorth` sum raw numbers across
  currencies and then label the result with `settings.currency`. A ₹50,000 savings account plus a
  $500 wallet displays as "₹50,500". CLAUDE.md claims conversion lives in `formatters.ts` — no
  conversion code exists anywhere.
  **Needs a product decision first:** either (a) add an FX rate table in settings with optional
  refresh and convert at every aggregation, or (b) drop per-account currency and go single-currency.

- [ ] **[L] Balances cannot be recomputed.** `Account.balance` is a mutable stored field seeded at
  creation and mutated by deltas. There is no `openingBalance`, so current balance is *not*
  derivable from transactions, and any drift (from the delete bug above, a partial import, a manual
  edit) is permanent and invisible.
  **Fix:** add `Account.openingBalance`, migrate to v4 by computing
  `openingBalance = balance − Σ(deltas of existing transactions)`, then add a `recomputeBalances()`
  action and a "Reconcile balances" button in Settings. This is the safety net that makes every
  other money bug recoverable.

- [ ] **[S] No tests anywhere.** `applyBalanceDelta`, `processRecurring`, and
  `computeBudgetStatuses` are pure functions and exactly where money bugs hide. Add Vitest and
  cover them.

---

## 2. Gaps in existing features

- [ ] **[S] Search is too narrow.** [`src/pages/Transactions.tsx:44`](src/pages/Transactions.tsx)
  matches only note and category name — not amount, account name, or labels.
- [ ] **[M] Recurring rules can only be created and deleted.** No edit, no pause, no end date, no
  occurrence count, no transfer support. A rule with an old `startDate` also retroactively injects
  hundreds of transactions and moves balances with no preview or confirmation.
- [ ] **[M] Budgets are monthly-only.** No weekly/yearly period, no rollover of unspent amounts, no
  per-label budgets, no budget history ("did I hit it last month?").
- [ ] **[S] Custom month start day.** All "this month" math hardcodes the calendar month. People on
  a 25th-of-the-month salary cycle need budget periods to match.
- [ ] **[S] Archive accounts instead of deleting.** Closing a bank account currently destroys its
  entire transaction history.
- [ ] **[M] Credit card lifecycle.** `creditLimit` is stored and barely used. Add statement close
  day, due date, minimum due, utilization %, and a "payment due in N days" Dashboard card. Credit
  is one of six account types and gets the least support.
- [ ] **[S] Native `confirm()` everywhere.** Every destructive action uses the browser dialog —
  inconsistent with the shadcn UI and unstylable. Replace with `AlertDialog`, and prefer
  undo-via-toast over confirm-first for transaction deletes.
- [ ] **[S] Onboarding.** First run greets you as "Alex" (the default in
  [`src/data/defaultData.ts`](src/data/defaultData.ts)). Add a wizard: name → currency → first
  account → opening balance.

### Backend features with no UI

All of these endpoints are implemented in PHP and wired up in
[`src/services/api.ts`](src/services/api.ts), but nothing in the app calls them:

- [ ] **[S] Backup history** — `listBackups`, `getBackup(date)`, `deleteBackup`. A list of versions
  with restore-by-date and delete. The hard part is already done.
- [ ] **[S] Change password** — `updateProfile` with `current_password` / `new_password`.
- [ ] **[S] Delete cloud account** — `api.deleteAccount`.

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
- [ ] **[S]** `confirm()` dialogs break focus management on mobile.

---

## Suggested sequencing

1. **Bug batch** (section 1, the `[S]` items) — correctness first, everything else builds on it.
2. **`openingBalance` + reconcile** (`[L]`) — the safety net.
3. **One flagship**: savings goals if the app should feel more complete, or CSV import +
   auto-categorization if new-user onboarding matters more.
4. **Backup history UI** — nearly free, the backend already supports it.
