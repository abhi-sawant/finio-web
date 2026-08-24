# Finio — Bugs, Improvements & Feature Ideas

A review pass over `src/` and `backend/` as of `a9f1ae0` (2026-08-24).

**Baseline health:** `npm test` → 534 passed / 26 files. `tsc -b` → clean. No `TODO`/`FIXME`/`any`
casts anywhere in `src/`. Two `eslint-disable` lines, both justified in place. The codebase is in
good shape — the findings below are mostly edge cases and cross-module invariant gaps, not
day-one breakage.

Every item marked **Confirmed** was reproduced by executing the code, not just by reading it.

---

## 1. Bugs

### P1 — data correctness

#### 1.1 `deleteLabel` orphans label-scoped budgets — **Confirmed**

[`src/store/useFinanceStore.ts:436`](src/store/useFinanceStore.ts:436)

`deleteCategory` filters `budgets` on the way out. `deleteLabel` cleans up `transactions.labels` and
`rules.labelIds` but **never touches `budgets`**. A budget scoped by `labelId` therefore survives its
label.

The consequence isn't cosmetic. `budgetMatchedAmount` short-circuits on `budget.labelId` and asks
`transaction.labels.includes(budget.labelId)` — no transaction carries the deleted id any more, so
the budget reports **₹0 spent, forever**, while `budgetScopeKey` still reserves `label:<deletedId>`
so the scope can't be reused. The UI renders it as literally `"Unknown label"`
([`Budgets.tsx:113`](src/pages/Budgets.tsx:113), [`Dashboard.tsx:174`](src/pages/Dashboard.tsx:174),
[`insights.ts:384`](src/utils/insights.ts:384)) and `buildNotificationSchedule` falls back to the
string `"Budget"` ([`notificationSchedule.ts:111`](src/utils/notificationSchedule.ts:111)).

Three separate modules already carry a fallback string for this state, and
[`importValidation.ts:792`](src/utils/importValidation.ts:792) explicitly *counts* label-orphaned
budgets in its dry-run report — so the shape was anticipated everywhere except the one action that
creates it.

**Repro:** create a label → create a budget scoped to it → delete the label → open Budgets.

**Fix:** add `budgets: state.budgets.filter((b) => b.labelId !== id)` to `deleteLabel`. Consider a
store test asserting that deleting any entity leaves no budget whose scope key dangles.

---

#### 1.2 `applyBalanceDelta` and `sumTransactionDeltas` disagree on a self-transfer — **Confirmed**

[`src/store/balance.ts:36`](src/store/balance.ts:36) vs [`:59`](src/store/balance.ts:59)

For a transfer where `accountId === toAccountId`:

| function | result for a ₹500 self-transfer |
|---|---|
| `applyBalanceDelta` | **−500** (or +500 on reverse) |
| `sumTransactionDeltas` | **0** |

`applyBalanceDelta` uses a `.map` with early `return`s, so the source branch fires and the
destination branch is unreachable for the same account. `sumTransactionDeltas` adds both legs and
nets to zero. These two are the incremental and the authoritative halves of the same invariant
(`balance === openingBalance + Σ deltas`), so any row like this makes the invariant unsatisfiable.

`AddTransaction` does block it ([`AddTransaction.tsx:263`](src/pages/AddTransaction.tsx:263)), but
the import path does **not**: `parseTransaction` only checks that a transfer *has* a
`toAccountId`, never that it differs from `accountId`
([`importValidation.ts:207`](src/utils/importValidation.ts:207)). So a hand-edited backup, a
third-party JSON, or a CSV import can seed one. From then on the balance is right after
`recomputeAccountBalances` and wrong after any `updateTransaction`/`deleteTransaction` — and
"Reconcile Balances" appears to silently move money each time it's run.

**Fix:** two lines, both cheap. Reject `accountId === toAccountId` in `parseTransaction`, and make
`applyBalanceDelta` compute a net delta per account instead of returning from the first matching
branch. A test asserting `applyBalanceDelta` and `sumTransactionDeltas` agree on an arbitrary tx
would have caught it.

---

#### 1.3 `calculateEmi` can return `NaN`, which poisons an account balance — **Confirmed**

[`src/utils/loan.ts:70`](src/utils/loan.ts:70), guard missing at
[`src/pages/AddLoan.tsx:67`](src/pages/AddLoan.tsx:67)

```
calculateEmi(100000, 999999, 360)  →  NaN
calculateEmi(1e9,    1e6,    600)  →  NaN
```

`Math.pow(1 + r, tenureMonths)` overflows to `Infinity` past roughly `r > 7.2` (an annual rate
around 86,400%), and `(p·r·Infinity) / (Infinity − 1)` is `NaN`. `parseFloat('1e400')` reaches the
same place from a much more innocent-looking input.

Nothing stops it being saved. `canSubmit` checks `name`, `principal > 0`, `tenure > 0`, `startDate`,
`accountId`, `categoryId` — the **rate is never validated**, and `previewEmi` is never checked for
finiteness. `addLoan` then writes `amount: NaN` onto the linked `RecurringTransaction`, and the next
`processRecurring()` posts a real transaction with `amount: NaN`. `applyBalanceDelta` does
`roundMoney(balance − NaN)` → the account balance becomes `NaN`.

The persistence layer makes it worse rather than better: `JSON.stringify(NaN)` is `null`, so after
one reload the account has `balance: null` in localStorage. Net worth, the forecast, the dashboard
and every chart downstream inherit it.

Two mitigations exist but neither is a fix: `sumTransactionDeltas` skips non-finite amounts (so
`recomputeBalances` *can* repair the cached balance), and `importValidation.asFiniteNumber` rejects
the row on the way through a backup. The bad transaction itself stays in the ledger either way.

**Fix:** return `0` (or `NaN`-guard) from `calculateEmi` when the result isn't finite; add
`Number.isFinite(previewEmi) && previewEmi > 0` and a sane rate ceiling to `canSubmit`; add a
`Number.isFinite(amount)` assertion in `addTransaction`/`applyBalanceDelta` so no code path can
ever write a non-finite balance.

---

#### 1.4 `processRecurring` never runs on many entry points, and never on resume — **Confirmed**

[`src/components/layout/Layout.tsx:66`](src/components/layout/Layout.tsx:66)

`processRecurring`, `captureNetWorthSnapshots`, `autoBackupIfNeeded`, `autoLocalBackupIfNeeded` and
`refreshNotificationSchedule` all live in `Layout`'s mount effects. `Layout` only wraps five routes
(Dashboard, Accounts, Transactions, Analytics, Settings). Every other route is full-screen and
outside it.

Two distinct failures fall out:

- **Deep-link entry skips everything.** A user who enters via the `Add Expense` manifest shortcut
  (`/add-transaction`), a Share Target (`/share-target`), a notification click into `/recurring` or
  `/budgets`, or a bookmark to `/goals` gets **no** recurring generation, no net-worth snapshot, no
  auto-backup and no reminder refresh for that whole session. The manifest ships four shortcuts and
  three of them land outside `Layout`.
- **No resume trigger.** The effect deps are `[isHydrated, processRecurring, bulkDeleteTransactions]`
  — all stable. An installed PWA left open for a week never generates a due recurring transaction
  until a hard reload. The only `visibilitychange` listener calls `runDueNotifications()`
  ([`Layout.tsx:110`](src/components/layout/Layout.tsx:110)), not `processRecurring`.

`CLAUDE.md` states the contract as *"when the app mounts **or resumes from background**"* — the
resume half isn't implemented.

**Fix:** hoist these effects into a `useAppLifecycle()` hook mounted in `App` (above `<Routes>`,
alongside `useAutoLock` — which already sits there for exactly this reason), and add a
`visibilitychange` pass. `useAutoLock` is the existing precedent for both the placement and the
resume handling.

---

#### 1.5 `deleteAccount` leaves templates pointing at a deleted account — **Confirmed**

[`src/store/useFinanceStore.ts:205`](src/store/useFinanceStore.ts:205)

`deleteAccount` is thorough about transactions, recurring rules, loans, prepayments and
`Goal.linkedAccountId` — but a `TransactionTemplate` carries `accountId` and `toAccountId` (it is
"every `Transaction` field except the date") and is not cleaned up.

Using such a template via the FAB long-press calls `addTransaction` with a dead `accountId`
([`Layout.tsx:46`](src/components/layout/Layout.tsx:46)). `applyBalanceDelta` matches no account, so
the transaction lands in the ledger affecting **no balance at all** — permanently invisible drift
between the transaction list and every account total, and it survives `recomputeBalances` because
there is no account to recompute.

Two smaller dangling-reference variants in the same action: `DebtEntry.settledTransactionId` and
`LoanPrepayment.transactionId` can both point at a transaction `deleteAccount` just removed.

**Fix:** filter templates whose `accountId`/`toAccountId` is the deleted account (matching how
`recurring` is handled two lines below), and null out the two stale transaction references.

---

### P2 — backend

#### 2.1 `request_body()` 500s on any non-object JSON body — **Confirmed by inspection**

[`backend/src/helpers.php:28`](backend/src/helpers.php:28)

```php
function request_body(): array {
    ...
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) { json_error('Invalid JSON body.', 400); }
    return $data;   // ← int|string|bool|null, not array
}
```

`json_decode('123', true)` returns `int(123)` with `JSON_ERROR_NONE`. Returning it from a function
declared `: array` is an uncaught `TypeError` — HTTP 500, and a stack trace if `display_errors` is on
(shared hosting default varies). Bodies of `123`, `"x"`, `true` and `null` all hit it, on **every**
POST/PUT route including the unauthenticated ones.

**Fix:** `if (!is_array($data)) json_error('Invalid JSON body.', 400);` before the return.

---

#### 2.2 `resetPassword` leaks account existence that `forgotPassword` deliberately hides

[`backend/src/controllers/AuthController.php:254`](backend/src/controllers/AuthController.php:254)

`forgotPassword` returns an identical message either way ("Always return success to prevent email
enumeration"), and `verifyOtp` carries an explicit comment about keeping a missing account and a bad
OTP indistinguishable. `resetPassword` then returns three **distinguishable** statuses:

| condition | response |
|---|---|
| no user, or no pending reset | `404` |
| pending reset, expired | `410` |
| pending reset, wrong OTP | `401` |

So `404` vs `401`/`410` tells an attacker whether an address is registered *and* has a live reset in
flight. The mitigation two functions away is undone here.

Related, same file: there is **no per-account OTP attempt counter or lockout**. A 6-digit OTP with a
15-minute window is guarded only by a per-IP limit (10 / 900 s on `/auth/reset-password`), which a
rotating-IP attacker walks straight past. Both `verifyOtp` and `resetPassword` are affected.

**Fix:** collapse all three branches to one generic `401`. Add an `otp_attempts` column, invalidate
the OTP after ~5 failures, and rate-limit by email address as well as by IP.

---

#### 2.3 Backup upload is a non-atomic, unlocked overwrite

[`backend/src/controllers/BackupController.php:51`](backend/src/controllers/BackupController.php:51)

```php
file_put_contents($file, $raw)
```

No `LOCK_EX`, no write-to-temp-then-`rename`. The filename is `YYYY-MM-DD.json`, so **today's upload
overwrites today's backup in place**. A connection dropped mid-write, or two devices uploading
concurrently, replaces a known-good backup with a truncated or interleaved one — and the DB row is
then updated to claim the corrupt file is valid.

For the app's only off-device copy of a user's finances, this is the highest-consequence line in the
backend.

**Fix:** write to `$file . '.tmp'` then `rename()` (atomic on POSIX), and pass `LOCK_EX`. Optionally
validate the decoded JSON has a recognisable shape before committing the rename.

---

#### 2.4 A failed OTP email still reports success

[`backend/src/controllers/AuthController.php:63`](backend/src/controllers/AuthController.php:63)

`send_mail()` returns `bool` and swallows `MailException`
([`helpers.php:120`](backend/src/helpers.php:120)). `register` ignores the return value and responds
`201 "Account created. Enter the 6-digit OTP sent to your email."` even when SMTP was unreachable.
The user waits for a mail that will never arrive, with no signal that anything failed. `resendOtp`
and `forgotPassword` have the same shape.

**Fix:** check the return value; on failure respond with a distinct error telling the user to retry,
and log the exception server-side.

---

#### 2.5 Smaller backend items

- **`INTERVAL ? DAY` placeholder** —
  [`BackupController.php:194`](backend/src/controllers/BackupController.php:194). Binding into an
  `INTERVAL` expression is version- and emulation-mode-dependent in MySQL. `$retentionDays` is
  already cast to `int`; interpolate it and keep the query portable.
- **Login timing side channel** —
  [`AuthController.php:175`](backend/src/controllers/AuthController.php:175). The `$dummyHash`
  fallback is a good instinct, but that string isn't a valid bcrypt hash (its salt uses characters
  outside bcrypt's alphabet), so `password_verify` rejects it immediately instead of burning a
  cost-12 round. Existence is still distinguishable by response time. Use a real
  `password_hash('', PASSWORD_BCRYPT, ['cost' => 12])` constant.
- **No 405** — `Router::dispatch` falls through to `404` when the path matches but the verb doesn't.
- **No token-revocation endpoint** — `token_version` is checked on every request but nothing can
  bump it except a password change. There's no "sign out of all devices".
- **`/user/me` leaks `token_version`** in the `update` response body.
- **Per-address email flooding** — `/auth/register` and `/auth/resend-otp` are limited per IP only, so
  a victim's inbox can be targeted from rotating IPs.

---

### P3 — behavioural / lower impact

#### 3.1 Credit-card statement close day can't exceed 28

[`src/pages/AddAccount.tsx:88`](src/pages/AddAccount.tsx:88) — `Math.min(28, Math.max(1, parseInt(...)))`

Real cards commonly close on the 29th–31st. The clamp silently rewrites 30 → 28, so
`getCreditCardDueInfo` computes a due date up to three days early and every card reminder fires
early, with no indication the value was changed.

The 28-day ceiling is correct for `monthStartDay` — 29–31 don't exist in February, and
`MAX_MONTH_START_DAY` documents exactly that. But `getCreditCardDueInfo` then reuses
`normalizeMonthStartDay` on `statementCloseDay`
([`calculations.ts:104`](src/utils/calculations.ts:104)), inheriting a constraint that belongs to a
different concept. A close day of 31 should mean "last day of the month", which is what card issuers
do.

Also: `parseInt` of an unparseable paste yields `Math.min(28, Math.max(1, NaN))` → `NaN` →
`statementCloseDay: null` after a reload.

**Fix:** allow 1–31 with an explicit clamp to the month's real last day at read time, and add a
`Number.isFinite` guard.

#### 3.2 Auto local backup downloads a file with no user gesture

[`src/services/backup.ts:106`](src/services/backup.ts:106),
[`:246`](src/services/backup.ts:246)

When no backup folder is connected (i.e. any non-Chromium browser, since the File System Access API
is Chromium-only), `saveLocalBackup` falls through to `downloadBlob`. Called from
`autoLocalBackupIfNeeded` inside a mount effect, that means an **unprompted daily file download**.
Browsers either drop a mystery `finio-backup-*.json` into Downloads once a day, or block the
gesture-less download outright — in which case the feature silently does nothing while its Settings
toggle reads as on.

**Fix:** in the no-folder case either skip and surface "connect a folder to enable this", or defer to
the next user interaction. Don't call `downloadBlob` from an effect.

#### 3.3 Archiving an account rewrites net-worth history

[`src/utils/netWorth.ts:68`](src/utils/netWorth.ts:68)

`accountBalancesAt` reconstructs from `activeAccounts(accounts)`, so archiving an account today
removes it from every *reconstructed* past month — while months already covered by a
`NetWorthSnapshot` keep it. The chart gets a visible step discontinuity at the snapshot boundary,
which is exactly the "history rewrote itself" failure the snapshot mechanism was built to prevent.
The module docstring reasons carefully about deletion doing this; archiving does it too.

**Fix:** reconstruct from all accounts and exclude only those archived *as of* the point being
reconstructed (`archivedAt > asOf` ⇒ still include), or state the limitation in the chart footnote.

#### 3.4 `isEncryptedEnvelope` doesn't bound `iterations`

[`src/utils/backupCrypto.ts:125`](src/utils/backupCrypto.ts:125)

The guard accepts any `number`. `decodeBackupResponse` then passes it straight into
`deriveEncryptionKey` ([`backup.ts:184`](src/services/backup.ts:184)). An envelope claiming
`iterations: 1e12` — from a compromised server, a MITM, or a malicious backup file a user was talked
into importing — hangs the tab in PBKDF2 with no way out.

**Fix:** require `Number.isInteger(r.iterations)` within a sane range (say 100k–2M) and reject
otherwise.

#### 3.5 CSV export is vulnerable to formula injection

[`src/utils/calculations.ts:567`](src/utils/calculations.ts:567)

`escape()` handles quotes correctly for CSV, but a `note` of `=HYPERLINK("https://evil","click")` —
or `+`, `-`, `@`, tab, CR — is interpreted as a formula when the export is opened in Excel, Sheets or
Numbers. Notes are user-typed, and on this app they can also arrive from a **bank CSV import**, so the
content isn't fully self-authored.

**Fix:** prefix any field starting with `= + - @ \t \r` with a single quote or `\t` before escaping.

#### 3.6 Auto-backup's "is there anything to back up?" guard is incomplete

[`src/services/backup.ts:261`](src/services/backup.ts:261),
[`:299`](src/services/backup.ts:299)

Both guards check `accounts / transactions / budgets / recurring / goals / people` and skip
`loans`, `loanPrepayments`, `debtEntries`, `goalContributions`, `templates`, `rules`,
`netWorthSnapshots`. `collectBackupPayload` right above is deliberately compile-enforced to be
exhaustive ("a new `FinanceStore` collection can't silently drop out of every backup") — these two
hand-maintained lists are the hole in that guarantee, and they'll drift again with the next entity.

**Fix:** derive emptiness from `collectBackupPayload()` (e.g. every array-valued key empty) so it
stays exhaustive by construction.

#### 3.7 `bulkRecategorize` writes `splits: undefined` instead of dropping the key

[`src/store/useFinanceStore.ts:336`](src/store/useFinanceStore.ts:336)

`restoreCategorization` twenty lines away goes out of its way to `delete restored.splits` with the
comment *"Match how splits serialize elsewhere: absent rather than explicitly undefined."*
`bulkRecategorize` sets `splits: undefined`. Harmless through `JSON.stringify` (which drops it), but
it's an in-memory shape difference that `Object.keys`/deep-equality would see, and it contradicts a
convention the file states explicitly.

---

## 2. Improvements

### Accessibility

- **Navigation is buttons, not links.** Both [`Layout.tsx:181`](src/components/layout/Layout.tsx:181)
  and [`Sidebar.tsx:35`](src/components/layout/Sidebar.tsx:35) render `<button onClick={navigate}>`.
  Consequences: no `aria-current="page"` (the active tab is conveyed *only* by colour plus a dot
  that is `aria-hidden`), no `href`, so no middle-click, no ⌘-click, no "copy link", and nothing for
  a screen reader to announce as a link. Swapping to `<NavLink>` fixes all of it in one change and is
  the single highest-value a11y item in the app.
- **Bottom-nav labels are 10px** (`text-[10px]`) — below the 12px floor most mobile a11y guidance
  uses, and it doesn't scale with the OS text-size setting.
- The `ChartDataTable` pattern is genuinely good and worth keeping as the standard for any new chart.

### Robustness patterns worth generalising

- **A single `Number.isFinite` chokepoint.** Findings 1.3 and 3.1 are both the same shape: a
  `parseFloat`/`parseInt` result flowing into persisted state unchecked. `sumTransactionDeltas`
  already defends itself (`balance.ts:54`); nothing else does. A shared `parseMoney()` /
  `parsePositiveInt()` used by every form would close the class rather than the instances.
- **Referential-integrity test.** Findings 1.1 and 1.5 are both "delete action X forgot collection
  Y". A single test that runs every `delete*` action against a fully-populated store and asserts no
  surviving row references a deleted id would catch all of them, plus the next one.
- **Cross-implementation agreement test.** Finding 1.2 is two functions computing the same quantity
  differently. A property test — for arbitrary `(accounts, tx)`, folding `applyBalanceDelta` equals
  `recomputeAccountBalances` — pins the invariant that `CLAUDE.md` already describes in prose.

### Performance

- `insights.ts` and `Dashboard.tsx` call `categories.find(...)` / `labels.find(...)` inside loops
  (e.g. [`calculations.ts:449`](src/utils/calculations.ts:449) inside the `byCat` loop). Fine at 32
  categories; `buildSearchIndex` is the right pattern to reuse if the loops get hotter.
- `computeBudgetStatuses` with `rollover` walks up to 12 prior periods **per budget**, re-filtering
  the full transaction list each time (`priorPeriods` → `transactionsInPeriod`). With ~20 budgets and
  a multi-year ledger that's 240 full scans per render. Bucketing transactions by period key once
  would collapse it.
- `dummydata.json` is a 339 KB fixture committed at the repo root, outside `src/`. If it's a QA
  fixture it belongs next to `sampleData.ts`; if it's a leftover it should go.

### Documentation

`CLAUDE.md` is unusually good — the "Common Gotchas" section is doing real work. Two entries drift
from the code and are worth correcting alongside the fixes above:

- *"Call `processRecurring()` when the app mounts **or resumes from background**"* — the resume half
  doesn't exist (finding 1.4).
- The balance-invariant entry should note the self-transfer disagreement (finding 1.2) until it's
  fixed, since it's the one documented invariant that can currently be violated.

---

## 3. Feature Ideas

Ordered by (my read of) value-to-effort. Nothing here duplicates what `README.md` already lists.

### Tier 1 — leans on machinery that already exists

1. **Split an expense with a person → debt entry.** Today `TransactionSplit` divides by *category*
   and `DebtEntry` is an entirely separate manual ledger. "I paid ₹2,400, Ravi owes ₹800" needs two
   unlinked entries. Wiring a per-person split on a transaction to auto-create the `DebtEntry` reuses
   the existing "Settle up" atomic pattern from the Debts page and closes the most obvious gap
   between two features that already ship.
2. **Recurring inbox instead of silent posting.** `processRecurring` posts on mount and leans on a
   toast with Undo as the review step — which is lost the moment the toast expires or the app was
   opened on a route outside `Layout` (finding 1.4). A "3 recurring transactions pending review"
   card, confirmable or editable before it hits balances, makes the existing intent durable.
3. **Budget templates / copy-forward.** `Budget.createdAt` already anchors the rollover chain, and
   `computeBudgetHistory` already shows per-period outcomes. "Copy last month's budgets" and
   "set from your 3-month average" are small additions over data already computed.
4. **Search & filter on the Merchants view.** `merchants.ts` groups by `normalizeNote()`; the page
   has no query box while Transactions has a full `buildSearchIndex`. Straight reuse.
5. **Manual merchant aliasing.** The documented limitation is that `"UPI/Swiggy/9921"` and a
   hand-typed `"Swiggy"` land in separate buckets. A user-editable alias map (`normalized → display
   name`) turns the heuristic into something correctable without introducing a `Merchant` entity.
6. **Reminder-privacy link.** Notification bodies honour `Settings.hideAmounts`
   ([`notificationSchedule.ts:89`](src/utils/notificationSchedule.ts:89)) — good — but not App Lock.
   With a PIN set, amounts still render on the OS lock screen. For a privacy-first app, "mask amounts
   in notifications when App Lock is on" is a one-line default worth having.

### Tier 2 — new logic, existing architecture

7. **Card-payment modelling in the forecast.** `forecast.ts` projects liquid cash only, so credit
   spend is invisible until a payment transfer appears — and if the user pays their card manually
   rather than via a recurring rule, it never appears at all. Since `getCreditCardDueInfo` already
   computes the due date and outstanding, the forecast could project the statement payment as a
   scheduled outflow. This is the largest accuracy gap in the projection.
8. **Envelope / zero-based budgeting mode.** Rollover already carries a signed balance forward
   period-to-period, which is most of the mechanism. Exposing it as "assign every rupee" would land
   a whole budgeting methodology on top of existing math.
9. **Multi-currency, properly.** Removed in schema v4 and hardcoded to INR throughout
   (`formatCurrency`, `en-IN`). Worth flagging as a deliberate ceiling: the app is currently
   unusable for anyone banking outside India, and re-adding it later is a migration across every
   aggregation. Only worth doing if that audience matters.
10. **Receipt attachments.** IndexedDB is already in use for the notification schedule, so blob
    storage has a precedent. Needs a real answer for how attachments interact with backups (they'd
    blow past the 10 MB `backup_max_size_mb` cap immediately) — probably "local-only, never
    uploaded", which is worth deciding before building.
11. **Shared / household mode.** The largest possible feature and the one most in tension with the
    architecture: everything is single-device localStorage with the backend as opaque blob storage.
    It would need real sync and conflict resolution. Listed for completeness, not recommended soon.

### Tier 3 — smaller polish

12. **Sign out everywhere.** `token_version` exists and is checked on every request; nothing exposes
    it (see 2.5).
13. **Undo/redo history beyond the toast.** Several actions return their removed rows precisely so
    they can be restored (`deleteTransaction`, `bulkDeleteTransactions`, `restoreCategorization`) —
    the plumbing for a real undo stack is already there.
14. **Keyboard shortcuts on desktop.** There's a full `Sidebar` layout at `lg+` with no keyboard
    affordances beyond tab order.
15. **Export to Excel/PDF.** CSV export exists; a formatted statement is a common ask — and would
    need finding 3.5 fixed first.

---

## Suggested order

1. **1.3** (NaN → corrupted balance) and **2.3** (backup overwrite) — both can destroy data.
2. **1.4** (lifecycle effects) — silently breaks recurring, snapshots, backups *and* reminders for
   anyone entering via a shortcut or share target.
3. **1.1**, **1.2**, **1.5** — correctness, all small, all worth a regression test each.
4. **2.1**, **2.2** — one-line fix and one security fix.
5. The `<NavLink>` swap — cheapest real user-facing win in the list.
