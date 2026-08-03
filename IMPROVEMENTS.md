# Finio — Improvements Backlog

Findings from a full review on 2026-07-28: static read of the source, `npm test` (463 passing),
`tsc -b` + `vite build` (both clean), `npm run lint` (failing), and a hands-on pass through the
running app on mobile (375×812) and desktop (1440×900) in light and dark, driven with a seeded
10-month fixture (343 transactions, 5 accounts, 5 budgets, 5 recurring rules, 3 goals, 2 people).

Every item below is either UI-layer or backend. **No bugs were found in the money math** —
`balance.ts`, `recurring.ts`, `netWorth.ts`, `forecast.ts` and `autoCategorize.ts` all held up.

Ordering within each section is by impact. Sections themselves are roughly in the order worth
tackling.

---

## P1 — Bugs

### 1. Every full-screen page is broken on desktop — ✅ Fixed

- [x] Move `lg:flex-row` off `#root` ([index.html:44](index.html#L44)) into `Layout`, or wrap
      standalone pages in a `flex flex-col flex-1 min-w-0` container.

**Fix:** `#root` now stays a plain `flex flex-col`; `lg:flex-row` moved onto a wrapper `div`
inside [`Layout.tsx`](src/components/layout/Layout.tsx) around `<Sidebar>` + the content column,
so only `Layout`-nested routes get the row direction. Verified `/budgets` (and other standalone
routes) stack header-above-content correctly at 1440px.

`#root` carries `flex flex-col relative h-screen lg:flex-row`. That is correct for `Layout`
(sidebar beside content), but standalone pages render `<Header>` + `<Main>` as *direct* `#root`
children — so at `lg` the header becomes a flex sibling of the content instead of stacking above
it. The header ends up stranded in the top-left corner, the card column sits centred-right, and
the left half of the screen is empty.

Measured at 1440px wide:

| Route | `<header>` | `<main>` |
|---|---|---|
| `/goals` | x=0, w=285 | x=574, w=576 |
| `/budgets` | x=0, w=240 | x=552, w=576 |
| `/debts` | x=0, w=301 | x=583, w=576 |
| `/recurring` | x=0, w=251 | x=557, w=576 |
| `/add-transaction` | x=0, w=260 | x=562, w=576 |
| `/import-csv` | x=0, w=267 | x=518, w=672 |
| `/manage-categories` | x=0, w=220 | x=542, w=576 |
| `/` (under `Layout`) | x=240, w=1200 | x=328, w=1024 — correct |

Affects all ~13 non-`Layout` routes: `/add-transaction`, `/edit-transaction/:id`, `/add-account`,
`/edit-account/:id`, `/manage-categories`, `/manage-labels`, `/category-rules`, `/budgets`,
`/recurring`, `/goals`, `/debts`, `/import-csv`, `/share-target`.

- [x] Verify all 13 routes at ≥1024px after the fix.

### 2. Chart Y-axis labels are clipped, displaying wrong numbers — ✅ Fixed

No `tickFormatter` on any numeric Y axis, combined with a fixed `width` too narrow for 6- and
7-digit rupee values. Confirmed via the DOM in `IncomeExpenseBar`: the ticks really are
`0 / 60000 / 120000 / 180000 / 240000`, but `240000` renders visually as `40000`, `180000` as
`80000`, and `120000` as `20000`. The chart shows plausible-but-wrong values.

- [x] [`IncomeExpenseBar.tsx:68`](src/components/charts/IncomeExpenseBar.tsx#L68) — `width={40}`
- [x] [`BalanceTrend.tsx:133`](src/components/charts/BalanceTrend.tsx#L133) — `width={50}`
- [x] [`CashFlowForecast.tsx:99`](src/components/analytics/CashFlowForecast.tsx#L99) — `width={50}`
- [x] [`NetWorthTrend.tsx:112`](src/components/analytics/NetWorthTrend.tsx#L112) — `width={50}`, 7-digit values

Fix for each: add `tickFormatter={(v) => formatCurrency(v, true)}` so the axis reads `₹2.4L`.
That shortens the label enough to remove the overflow as well as making it readable.

**Fix:** Added `tickFormatter={money}` (the existing local `formatCurrency(v, true, hideAmounts)`
helper already in scope in each file) to all four `YAxis`. Verified in the DOM that ticks now
render full, correct values (e.g. `₹0 / ₹55,000 / ₹1.1L / ₹1.7L / ₹2.2L`).

### 3. Nested `<button>` in Analytics — ✅ Fixed

- [x] [`Analytics.tsx:137`](src/pages/Analytics.tsx#L137) — pass the `<Button>` via
      `render={<Button …/>}` instead of as a child of `PopoverTrigger`.

Currently produces `<button><button>`, invalid HTML, and React logs
`"<button> cannot contain a nested button"` on every Analytics visit.
[`date-picker.tsx:43`](src/components/ui/date-picker.tsx#L43) already uses the correct pattern —
copy it.

- [x] Re-check the browser console on `/analytics` is clean afterwards.

**Fix:** Switched the date-range trigger to `<PopoverTrigger render={<Button …/>} />`, same
pattern as `date-picker.tsx`. Confirmed no console errors on `/analytics`.

### 4. The FAB permanently covers right-aligned amounts — ✅ Fixed

The FAB is `fixed right-4` at `bottom: calc(env(safe-area-inset-bottom) + 5.5rem)` and 56px tall
([`Layout.tsx:127`](src/components/layout/Layout.tsx#L127)), so it occupies a fixed band over the
right edge of every scrolling list. `Main`'s `pb-24`
([`main.tsx`](src/components/ui/main.tsx)) clears the tab bar but not the FAB. Observed clipping
"Monthly rent **-₹3…**" and "Freelance project **+₹…**" on the dashboard, and both Savings Goals
amounts. Amounts are the one thing that must never be occluded.

- [x] Pick a fix: hide-on-scroll FAB, shrink to a mini-FAB, or reserve right-edge padding on
      mobile list rows.
- [x] Check the dashboard, Transactions, Goals and Debts lists at 375×812.

**Fix:** Went with reserved right-edge padding (`pr-16 lg:pr-4`/`lg:pr-3`), not hide-on-scroll —
the clipping happens at rest (natural page-load scroll position), not only while actively
scrolling, so hiding the FAB during scroll wouldn't have covered the reported case. Applied to
every full-width Dashboard card (Budget Alert, Overall Budget, Top Category, Savings Goals,
Debts & Lending, Card Payments Due, Upcoming Bills) and to
[`TransactionItem.tsx`](src/components/transactions/TransactionItem.tsx), which covers both
Recent Transactions on the dashboard and the full Transactions list. Note: the standalone
`/goals` and `/debts` pages aren't rendered under `Layout`, so the FAB was never present there —
only the Dashboard's "Savings Goals" and "Debts & Lending" cards were actually at risk. Verified
visually at 375×812 that amounts now clear the FAB.

### 5. `npm run lint` fails (10 errors) — ✅ Fixed

- [x] `@typescript-eslint/no-explicit-any` — `auth/Login.tsx:32`, `auth/Register.tsx:34`,
      `auth/ForgotPassword.tsx:27`, `auth/ResetPassword.tsx:67`, `auth/VerifyOtp.tsx:63` and `:75`.
      All are `catch (err: any)`; use `unknown` with a narrowing helper.
- [x] `react-refresh/only-export-components` — [`button.tsx:58`](src/components/ui/button.tsx#L58),
      [`date-time-picker.tsx:113`](src/components/ui/date-time-picker.tsx#L113). Move the shared
      constants/functions into sibling modules.
- [x] Dead code: `colToStr` unused at
      [`ImportCsv.tsx:41`](src/pages/ImportCsv.tsx#L41).
- [x] One warning worth a decision: `react-hooks/incompatible-library` on `useVirtualizer` at
      [`Transactions.tsx:137`](src/pages/Transactions.tsx#L137) — React Compiler skips memoizing
      the component. Either accept and document it, or suppress it deliberately.

CLAUDE.md lists `npm run lint` as a standard command, so this should be green.

**Fix:** Added [`utils/errors.ts`](src/utils/errors.ts) — a `getErrorMessage(err, fallback)`
helper (with tests) — and switched all six `catch (err: any)` sites to `catch (err)` +
`getErrorMessage`. Split `buttonVariants` out into
[`button-variants.ts`](src/components/ui/button-variants.ts) and the datetime-parsing helpers
into [`date-time-picker-utils.ts`](src/components/ui/date-time-picker-utils.ts), so both
component files export only their component. Removed unused `colToStr`. Suppressed the
`useVirtualizer` warning with a documented `eslint-disable-next-line` — the library's returned
functions are stable by contract, so the Compiler's skip is a known false positive, not a real
staleness risk. `npm run lint` is now clean (0 errors, 0 warnings); `npm test` (466 passing),
`tsc -b`, and `npm run build` all still pass.

---

## P1 — Backend security

### 6. No rate limiting on any endpoint

- [ ] `POST /auth/verify-otp` — [`AuthController.php:98`](backend/src/controllers/AuthController.php#L98)
      accepts unlimited guesses against a 6-digit OTP valid for 15 minutes. Brute-forceable.
      Add a per-user attempt counter that invalidates the OTP after ~5 failures.
- [ ] `POST /auth/login` — unlimited password guesses. Add attempt counting plus a lockout window.
- [ ] `POST /auth/register` and `POST /auth/resend-otp` — unlimited SMTP sends. Spam vector, and a
      risk to the sending domain's mail reputation. Throttle per email and per IP.
- [ ] Schema: add the columns these need (`failed_attempts`, `locked_until`, `otp_attempts`) to
      [`backend/schema.sql`](backend/schema.sql), plus a migration note in the setup guide.

### 7. `/backup/upload` has no size cap

- [ ] [`BackupController.php:26`](backend/src/controllers/BackupController.php#L26) reads
      `php://input` and writes it straight to disk with no ceiling. Any authenticated user can
      fill the volume. Check `Content-Length` / `strlen($raw)` against a configurable maximum
      before writing, and return 413 past it.

### 8. Email-enumeration inconsistency

- [ ] `forgotPassword` deliberately always returns success — correct, keep it. But `verifyOtp`
      ([`:90`](backend/src/controllers/AuthController.php#L90)) and `resendOtp`
      ([`:135`](backend/src/controllers/AuthController.php#L135)) both return
      `404 "No account found with this email."`, leaking exactly what the other endpoint
      protects. Make the responses uniform.

### 9. Optional: JWT has no revocation path

- [ ] A token stays valid until `exp` even after the cloud account is deleted via
      `DELETE /user/me`. Low severity given the threat model (the account's backups are gone
      anyway), but worth a token-version column if cloud accounts grow in importance.

---

## P2 — Formatting and copy

### 10. `COMPACT_THRESHOLD` splits numbers meant to be compared

`COMPACT_THRESHOLD = 100_000` in [`formatters.ts`](src/utils/formatters.ts) is applied
per-value, so groups of related numbers mix notations and become impossible to compare at a
glance. Observed:

- Dashboard hero: Income **₹2.3L** beside Expenses **₹90,010**
- Analytics summary: **₹2.3L** / **₹90,010** / **₹1.4L**
- Account cards: **₹9.9L** beside **₹10,241**
- Upcoming Bills: **+₹1.9L**, **-₹14,999**

- [ ] Add a group-aware helper — compact the whole set if *any* member crosses the threshold —
      and use it for each of the four call sites above.

### 11. Paise leak into every derived amount

`formatCurrency` uses `maximumFractionDigits: 2`, so averages and projections expose paise:

- [ ] Dashboard: "DAILY AVG ₹3,214.64", "Projected: ₹99,653.93"
- [ ] Dashboard: "Min ₹1,867.25" on Card Payments Due
- [ ] Insights copy: "On pace for ₹6,972.79 this month, against ₹536.33 on average"

Round derived/projected values to whole rupees (a `precision` option on `formatCurrency`, or
rounding at the producer in `insights.ts` / `getDashboardStats`).

### 12. "Upcoming Bills" lists income

- [ ] The dashboard card shows "Monthly salary · Due in 4 days · **+₹1.9L**". Salary is not a
      bill. Either retitle to "Upcoming" or separate income from bills.

### 13. Budget Alert and Monthly Budget state the same fact twice

- [ ] Stacked adjacent on the dashboard: "Overall Expenses · Near limit · 95%" then
      "Monthly Budget · Near limit · ₹90,010 / ₹95,000". Merge into one card.

### 14. Mismatched label and sub-label

- [ ] "SAVINGS RATE — 60%" carries the sub-line "Spend +17% vs last mo". The delta describes
      spend, not the savings rate.

### 15. No cap on insight percentages

- [ ] `buildInsights()` produced "Food is **1200%** above your 3-month average". Past roughly
      200% the figure reads as a bug — clamp and switch to multiplier phrasing ("3× your average").

### 16. `recurring.length` is labelled "active" but counts paused rules

- [ ] [`Analytics.tsx`](src/pages/Analytics.tsx) tools list and the dashboard both do this. The
      dashboard's own `upcomingRecurring` memo already filters correctly with `isRulePaused` —
      reuse it. Same question for `budgets.length`.

---

## P2 — UX gaps

### 17. Transaction rows never show the category, and never show labels

In [`TransactionItem.tsx:109`](src/components/transactions/TransactionItem.tsx#L109) the category
is used only for the icon *tint*, and as a title fallback when `note` is empty — which is rare.
Labels are not rendered at all. So each row shows note + account + `12:00 PM`, and the two primary
organizing dimensions of the app are invisible in the list.

- [ ] Show the category name in the secondary line (the time-of-day is the least useful field
      there — rows sit under a date header, and every recurring/imported row reads `12:00 PM`).
- [ ] Use the existing `CategoryIcon` instead of the generic type arrow.
- [ ] Render label chips (they already carry colors).

### 18. No category or label filter on Transactions

- [ ] Filters are type / account / date only, so "all Food spending last month" requires free-text
      search. Add category and label selects to the filter panel in
      [`Transactions.tsx`](src/pages/Transactions.tsx).
- [ ] While there: the account filter lists archived accounts.

### 19. Recent Transactions on the dashboard shows no date

- [ ] Rows show only the time, so you can't tell whether an entry is from today or last week.

### 20. Nothing between 768px and 1024px

- [ ] The sidebar appears at `lg`, so tablets and small laptops get the mobile layout stretched
      full-width — single-column cards with ~750px-wide progress bars. Add an `md` treatment.

### 21. Dashboard stays single-column on desktop

- [ ] Analytics correctly uses `lg:grid-cols-2`; [`Dashboard.tsx`](src/pages/Dashboard.tsx) does
      not, leaving a lot of dead horizontal space.

### 22. Card Payments Due shows only the minimum

- [ ] `Min ₹1,867.25` is shown, but not the total outstanding — which is the number people
      actually act on.

### 23. No search debounce on Transactions

- [ ] [`Transactions.tsx:81-135`](src/pages/Transactions.tsx#L81) rebuilds the search index,
      re-filters the full transaction list, then re-sorts and re-groups it on **every keystroke**.
      Fine at 343 rows, not at 10k. Debounce the query.
- [ ] Hoist `buildSearchIndex` into its own memo keyed on `[categories, accounts, labels]` so it
      rebuilds per data change rather than per keystroke.

---

## P3 — Maintainability

### 24. `Settings.tsx` is 1,909 lines in one component with 40 `useState` hooks

[`Settings.tsx`](src/pages/Settings.tsx) holds the profile editor, local and cloud backup, backup
history, folder picker, restore preview, notification preferences, the app-lock PIN flow,
biometrics, the backup-passphrase flow, password change, and account deletion. This is the single
most likely place for a bug to hide.

- [ ] Extract `ProfileSection`, `BackupSection`, `AppLockSection`, `NotificationsSection`,
      `CloudAccountSection`.
- [ ] The PIN dialog and the passphrase dialog are near-identical multi-phase state machines
      (`'length' | 'current' | 'enter' | 'confirm'` vs `'current' | 'enter' | 'confirm'`) —
      factor out one shared component.

### 25. The backup entity list is maintained twice

- [ ] `uploadBackup` destructures 14 entities into `BackupPayload`, and
      `autoLocalBackupIfNeeded` independently rebuilds the same object
      ([`backup.ts`](src/services/backup.ts)). CLAUDE.md's own checklist warns that a missed
      entity "silently drops out of every backup" — two hand-maintained lists is precisely how
      that happens. Introduce one `collectBackupPayload()` used by both, typed so that adding a
      `FinanceStore` key without wiring it up is a compile error.

### 26. Small cleanups

- [ ] [`ImportCsv.tsx:57`](src/pages/ImportCsv.tsx#L57) re-implements `activeAccounts` as a local
      `accounts.filter(a => !a.archivedAt)`, shadowing the shared helper's name.
- [ ] Blob-download logic is duplicated in
      [`Transactions.tsx:154`](src/pages/Transactions.tsx#L154) and
      [`backup.ts:72`](src/services/backup.ts#L72) — extract a `downloadBlob()` util.
- [ ] The six filter chips in [`Analytics.tsx`](src/pages/Analytics.tsx) are hand-written
      near-identical `<Button>` blocks; collapse to a `.map` over a config array.

### 27. `vendor-charts` is 396KB (116KB gzip)

- [ ] Roughly half the shipped JS, for a library used only on Analytics. Measure the cost of a
      lighter charting library or hand-rolled SVG — `ChartDataTable` already provides the
      accessible fallback, which removes the usual objection.

---

## P3 — New features

### High value for what already exists

- [ ] **Receipt attachments.** Absent, and the highest-frequency ask for an expense tracker.
      IndexedDB is already wired up for notifications — store compressed blobs there and include
      them in the backup envelope.
- [ ] **Loan / EMI tracking.** Very India-relevant and entirely missing. Principal, rate, tenure,
      amortization schedule, auto-generated recurring payment, prepayment impact.
      `RecurringTransaction` plus the credit-card lifecycle fields are most of the scaffolding.
- [ ] **Split a bill with a person.** `TransactionSplit`, `Person`, `DebtEntry` and the atomic
      "Settle up" flow all exist. Joining them — "₹2,400 dinner, Rahul owes ₹800" creating the
      expense *and* the debt entry in one action — is a Splitwise-lite feature at low marginal cost.
- [ ] **Account reconciliation.** `recomputeBalances()` exists but only as a manual repair tool.
      Surface it as a flow: enter your statement balance → show the difference → offer an
      adjustment transaction. Directly serves the derived-balance architecture.
- [ ] **Merchant view.** The rules engine already pattern-matches notes. Normalize notes into
      merchants and you get "spending by merchant", "your 5 most frequent merchants", and much
      better rule suggestions — with no schema change.

### Smaller, high-leverage

- [ ] **"Load sample data" in onboarding.** A fixture had to be hand-written to see the app do
      anything; a new user faces the same empty state. Doubles as a manual-QA fixture.
- [ ] **Cash-flow calendar.** A month grid of known future inflows/outflows from recurring rules
      and card dues. `forecast.ts` and `SpendingHeatmap` already have the pieces.
- [ ] **Recurring inbox.** `processRecurring()` posts silently on launch. An optional
      "3 transactions were generated — review" step catches wrong amounts before they reach
      balances.
- [ ] **Year in review.** One-screen annual summary — cheap on top of `analytics.ts` +
      `netWorth.ts`, and highly shareable.
- [ ] **Goal auto-funding.** Link a recurring transfer to a `Goal` so contributions post
      themselves instead of needing manual logging.
- [ ] **Impossible-balance warning.** A cash or debit account going negative is almost always a
      data-entry error worth flagging.

### Larger

- [ ] **Investment holdings.** The `investment` account type tracks a single balance only.
      Quantity + cost basis + manual price refresh would make it real portfolio tracking. Biggest
      lift on this list.
