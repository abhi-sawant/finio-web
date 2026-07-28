# Finio Web — CLAUDE.md

## Project Overview

**Finio** is a privacy-first personal finance PWA (Progressive Web App). It is fully offline-capable — all data lives in browser localStorage via Zustand. The optional PHP backend adds JWT-authenticated cloud backup only; the app works entirely without it, and there is no auth guard on any route.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- **Backend (optional):** PHP 8+ with MySQL, JWT auth, and email OTP. Cloud backups can be end-to-end encrypted client-side, in which case the server holds only an opaque envelope.

[README.md](README.md) is the user- and self-hoster-facing document; this file is the architecture
guide.

---

## Key Commands

```bash
# Development
npm run dev          # Start Vite dev server (default port 5173)

# Production
npm run build        # tsc + vite build → dist/
npm run preview      # Serve the dist/ build locally

# Code Quality
npm run lint         # ESLint
npm run format       # Prettier (with tailwindcss plugin)

# Tests
npm test             # Vitest (unit suite, run once)
npm run test:watch   # Vitest watch mode
```

Tests live next to their subject as `*.test.ts` — 463 of them across 22 files — and cover the
pure money logic (`src/store/balance.ts`, `src/store/recurring.ts`, `src/utils/calculations.ts`,
`src/utils/period.ts`, `src/utils/importValidation.ts`, `src/utils/csvImport.ts`,
`src/utils/autoCategorize.ts`, `src/utils/analytics.ts`, `src/utils/forecast.ts`,
`src/utils/netWorth.ts`, `src/utils/insights.ts`, `src/utils/notifications.ts`,
`src/utils/notificationSchedule.ts`, `src/utils/shareTarget.ts`, `src/utils/pinCrypto.ts`,
`src/utils/appLock.ts`, `src/utils/backupCrypto.ts`, `src/utils/chartTable.ts`,
`src/utils/formatters.ts`) plus the finance, app-lock and backup-crypto stores. Config is in
`vitest.config.ts` — separate from `vite.config.ts` and running in the `node` environment, so no
browser plugins are loaded.

That `node` environment is a real constraint: `include` matches **`.test.ts` only**, there is no
jsdom and no setup file, so `window`, `Notification` and IndexedDB do not exist. Anything
platform-facing has to be split into a pure module that is tested and a thin I/O wrapper that
isn't (`notificationDb`/`notificationRunner`, `appLockBiometric`, `LockScreen`). Node *does*
expose `crypto.subtle`, which is why `pinCrypto.ts` is fully testable.

---

## Environment Variables

Copy `.env.example` to `.env` and set:

```
VITE_API_URL=https://api.yourdomain.com
```

If `VITE_API_URL` is not set, the API client defaults to `https://api.finio.slowatcoding.com`. All `VITE_*` variables are inlined at build time by Vite.

---

## Architecture

### Frontend (src/)

**Offline-first.** The app stores all finance data in localStorage. Cloud backup is an optional feature, not a requirement for the app to function.

```
src/
├── main.tsx                  # React root, wraps in ThemeProvider
├── App.tsx                   # BrowserRouter, gates (lock → onboarding), lazy routes, Sonner
├── pages/                    # Route-level components (all lazy-loaded)
│   └── auth/                 # Login, Register, VerifyOtp, ForgotPassword, ResetPassword
├── components/
│   ├── ui/                   # shadcn/ui primitives + confirm(), switch, number-pad
│   ├── charts/               # Recharts wrappers + ChartDataTable (a11y fallback)
│   ├── analytics/            # Analytics-page cards (forecast, net worth, heatmap, insights)
│   ├── applock/              # LockScreen + PinPad (rendered instead of the app while locked)
│   ├── onboarding/           # First-run wizard (name → account → opening balance)
│   ├── accounts/ budgets/ categories/ goals/ people/ transactions/   # Per-domain cards & icons
│   ├── layout/               # Layout.tsx (bottom tabs + FAB), Sidebar.tsx, navItems.ts
│   ├── ErrorBoundary.tsx     # Top-level crash boundary, above BrowserRouter
│   ├── HideAmountsToggle.tsx # Eye/eye-off button in every data-bearing page header
│   └── ThemeProvider.tsx     # dark/light/system theme context
├── sw/sw.ts                  # Hand-written service worker (own TS project — see PWA below)
├── hooks/
│   ├── useAutoLock.ts        # visibilitychange/pagehide → re-lock after the grace window
│   └── useLongPress.ts       # Pointer-based long-press (transaction rows, template FAB)
├── store/
│   ├── useFinanceStore.ts    # All finance data + actions (Zustand + localStorage)
│   ├── balance.ts            # Pure balance math: deltas, opening-balance backfill, recompute
│   ├── recurring.ts          # Pure recurring planner (planRecurring, nextDueDate, previewBackfill)
│   ├── useAuthStore.ts       # Token, user profile, lastBackupAt (Zustand + localStorage)
│   ├── useAppLockStore.ts    # PIN hash, auto-lock delay, isLocked (key `finio-lock`)
│   └── useBackupCryptoStore.ts # Backup passphrase config + in-memory session key
├── services/
│   ├── api.ts                # Typed fetch wrapper, Bearer token injection
│   ├── backup.ts             # Cloud upload/download (E2EE) + local JSON export/import
│   ├── backupFolder.ts       # File System Access API folder handle for local auto-backups
│   ├── notifications.ts      # DOM-side: permission, schedule refresh, periodic sync
│   ├── notificationDb.ts     # IndexedDB schedule + fired ledger (shared with the SW)
│   ├── notificationRunner.ts # Shows what's due — called by the app *and* the worker
│   ├── appLockSession.ts     # backgroundedAt timestamp (localStorage, survives a page kill)
│   └── appLockBiometric.ts   # WebAuthn platform authenticator (convenience unlock)
├── types/index.ts            # All domain interfaces (Account, Transaction, Budget, etc.)
├── utils/
│   ├── calculations.ts       # Financial aggregations, budget status/history, CSV export
│   ├── period.ts             # Weekly/monthly/yearly period math (honours monthStartDay)
│   ├── importValidation.ts   # Backup shape validation + dry-run report
│   ├── csvImport.ts          # Bank-statement CSV parsing + column mapping
│   ├── autoCategorize.ts     # Pure rule engine: note pattern → category + labels
│   ├── analytics.ts          # Period-over-period comparison + spending calendar grid
│   ├── forecast.ts           # Liquid cash-flow projection (recurring + category averages)
│   ├── netWorth.ts           # Net worth series, reconstruction, and monthly snapshots
│   ├── insights.ts           # Insights feed + subscription detection
│   ├── notifications.ts      # Reminder types + due-selection (leaf — imported by the SW)
│   ├── notificationSchedule.ts # Pure builder: bills, budget breaches, card dues → schedule
│   ├── shareTarget.ts        # Share Target / shortcut param parsing (SMS amount extraction)
│   ├── pinCrypto.ts          # PBKDF2 PIN hashing, salt, base64url
│   ├── appLock.ts            # shouldLockOnResume + failed-attempt backoff ladder
│   ├── backupCrypto.ts       # AES-GCM envelope + PBKDF2 key derivation for cloud backups
│   ├── chartTable.ts         # sampleForTable() — thins a long series for the data table
│   └── formatters.ts         # Currency (INR), date, number formatting
├── lib/utils.ts              # shadcn cn() helper
└── data/defaultData.ts       # Default categories, labels, and settings
```

### State Management

Four Zustand stores, all persisted to localStorage:

- **`useFinanceStore`** (`finio-storage`) — accounts, transactions, categories, labels, budgets, recurring rules, templates, category rules, goals + contributions, people + debt entries, net-worth snapshots, settings. Exposes granular selector hooks (`useAccounts()`, `useTransactions()`, etc.) to avoid re-renders. Includes `processRecurring()` for generating due recurring transactions, `importData(payload, { mode })` for merge/replace restore, `captureNetWorthSnapshots()` for the monthly net-worth ledger, `applyRulesToExisting()` to replay categorization rules, and `recomputeBalances()` to reconcile drift. Has migration support (currently v13).
- **`useAuthStore`** (`finio-auth`) — JWT token, user object, `lastBackupAt`. Use `loadAuth()` on app start to hydrate from storage.
- **`useAppLockStore`** (`finio-lock`) — PIN hash + salt, auto-lock delay, WebAuthn credential id, failed-attempt count, and the transient `isLocked`/`isReady` flags. **Separate from the finance store on purpose** — see the app-lock gotcha below. Uses `partialize` so the transient flags are never written, and decides the cold-start lock in `onRehydrateStorage` rather than an effect.
- **`useBackupCryptoStore`** (`finio-backup-crypto`) — `BackupCryptoConfig` (salt, iterations, passphrase verifier) plus the derived `CryptoKey`, which is **in-memory only** and never persisted. Separate from `Settings` for the same reason as the lock store — see the encrypted-backup gotcha below.

### Routing

React Router v7 (the `react-router` package — `react-router-dom` is not a dependency). All pages
are lazy-loaded (dynamic `import()`). **There is no auth guard on any route:** the app is
offline-first and works signed-out, so the old `ProtectedRoute` was deleted. What *does* gate the
app is rendered above `<Routes>` in `App.tsx` — hydration → app lock → onboarding.

- `/` — Dashboard (index)
- `/accounts`, `/transactions`, `/analytics`, `/settings`, `/budgets`, `/recurring`
- `/add-transaction`, `/edit-transaction/:id`, `/add-account`, `/edit-account/:id`
- `/manage-categories`, `/manage-labels`, `/category-rules`
- `/goals`, `/debts`, `/import-csv`
- `/share-target` — Web Share Target; renders `AddTransaction`. **Must stay an explicit route**, or the `*` catch-all would redirect to `/` and drop the shared payload's query params.
- `/login`, `/register`, `/verify-otp`, `/forgot-password`, `/reset-password` — cloud-account routes
- `*` → redirects to `/`

Routes under the `<Layout>` element (Dashboard, Accounts, Transactions, Analytics, Settings) get
the bottom tab bar + FAB on mobile and the `Sidebar` on desktop; everything else is a full-screen
page.

### Backend (backend/)

PHP 8+ single-entry-point API (`backend/public/index.php`). Only needed for cloud backup and user accounts.

```
backend/
├── public/index.php          # Routing entry point
├── src/
│   ├── Database.php          # PDO MySQL wrapper
│   ├── Config.php            # Reads config.php
│   ├── Router.php            # Minimal path/method router
│   ├── helpers.php           # JSON response helpers
│   ├── middleware/AuthMiddleware.php
│   └── controllers/
│       ├── AuthController.php    # register, verify-otp, resend-otp, login, forgot/reset-password
│       ├── UserController.php    # /user/me (get, update, delete)
│       └── BackupController.php  # upload, list, latest, get-by-date, delete
├── composer.json             # firebase/php-jwt + phpmailer/phpmailer
├── config.example.php        # Template — copy to config.php and fill in
├── schema.sql                # MySQL schema (users + backups tables)
└── SETUP_GUIDE.txt           # 11-step self-hosting guide
```

**API base:** `VITE_API_URL` (e.g. `https://api.yourdomain.com`)

Endpoints (`backend/public/index.php` is the full list):

| Method + path | Auth | Purpose |
|---|---|---|
| `POST /auth/register` | — | Creates the account, emails an OTP |
| `POST /auth/verify-otp` | — | → `{ token, user }` |
| `POST /auth/resend-otp` | — | Re-sends the verification OTP |
| `POST /auth/login` | — | → `{ token, user }` |
| `POST /auth/forgot-password` / `POST /auth/reset-password` | — | OTP-based reset |
| `POST /backup/upload` | JWT | JSON body — one backup per user per day |
| `GET /backup/latest` | JWT | Most recent backup payload |
| `GET /backup/list` | JWT | Every backup's date + size (Backup History dialog) |
| `GET /backup/{date}` / `DELETE /backup/{date}` | JWT | Restore or delete one version |
| `GET /user/me` | JWT | Profile |
| `PUT /user/me` | JWT | Change password (`current_password`/`new_password`) → new JWT |
| `DELETE /user/me` | JWT | Delete the cloud account + all its backups |

The backup body is opaque to the server. When cloud encryption is on it is an
`{v, enc, kdf, iterations, salt, iv, ciphertext}` envelope rather than the finance payload — no
backend change was needed for E2EE, and legacy plaintext backups stay restorable.

---

## Domain Types

Defined in [src/types/index.ts](src/types/index.ts):

| Type | Key fields |
|------|-----------|
| `Account` | id, name, type, color, icon, balance, openingBalance, creditLimit?, statementCloseDay?, paymentDueDays?, minimumDuePercent?, archivedAt? |
| `Transaction` | id, type, amount, accountId, toAccountId?, categoryId, date, labels[], recurringId?, splits? |
| `TransactionSplit` | categoryId, amount — ≥2 entries summing exactly to `Transaction.amount`; `categoryId` on the parent is `''` |
| `Category` | id, name, icon, color, type |
| `Label` | id, name, color |
| `Budget` | id, categoryId ('' = overall budget), labelId?, amount, period, rollover |
| `RecurringTransaction` | id, type, amount, accountId, toAccountId?, categoryId, frequency, startDate, endDate?, maxOccurrences?, occurrenceCount, pausedAt?, lastRunDate |
| `TransactionTemplate` | id, name + every `Transaction` field except the date |
| `CategoryRule` | id, pattern, matchType, scope, categoryId, labelIds[], enabled |
| `Goal` | id, name, icon, color, targetAmount, targetDate?, linkedAccountId? (informational only) |
| `GoalContribution` | id, goalId, amount (signed), date, note — the goal's own ledger, not a transaction |
| `Person` | id, name, icon, color |
| `DebtEntry` | id, personId, amount (+ = they owe you), date, note, settledTransactionId? |
| `NetWorthSnapshot` | id, periodKey (`yyyy-MM`), date, assets, liabilities |
| `Settings` | theme, userName, autoLocalBackup, monthStartDay, onboardedAt?, hideAmounts, notificationsEnabled, notifyBills, notifyBudgets, notifyCreditDue, notifyLeadDays |
| `AppLockConfig` | enabled, salt, hash, iterations, pinLength, autoLockMinutes, webauthnCredentialId — **not** in `Settings`, see gotchas |
| `BackupCryptoConfig` | enabled, salt, iterations, verifierIv, verifierCiphertext — **not** in `Settings`, same reason |
| `ScheduledNotification` | id (`kind:subject:occurrence`), kind, fireAt, expiresAt, title, body, url |

Enums: `AccountType`, `TransactionType` (expense/income/transfer), `RecurrenceFrequency` (daily/weekly/monthly/yearly), `BudgetPeriod` (weekly/monthly/yearly), `RuleMatchType` (contains/startsWith/endsWith/equals/regex), `RuleScope` (expense/income/any), `Theme` (dark/light/system).

---

## UI & Styling

- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`; directives in `index.css`).
- **shadcn/ui** with `base-nova` style, using `@base-ui/react` under the hood. Add new components with `npx shadcn@latest add <component>`.
- **Lucide React** for icons.
- **Sonner** for toast notifications (mounted in `App.tsx`).
- **Recharts** for all charts in the Analytics page. Every chart whose data lived only in the SVG is paired with [`ChartDataTable`](src/components/charts/ChartDataTable.tsx) — a real `<table>` behind a "View data table" disclosure.
- **@tanstack/react-virtual** for the virtualized transactions list.
- **papaparse** for bank-statement CSV parsing.
- Confirmations go through `useConfirm()` ([`src/components/ui/confirm.tsx`](src/components/ui/confirm.tsx)), never native `confirm()`. Toggles use `Switch`/`SwitchField` ([`src/components/ui/switch.tsx`](src/components/ui/switch.tsx)), never a hand-rolled `<span role="switch">`.

---

## PWA

Configured in [vite.config.ts](vite.config.ts) via `vite-plugin-pwa`, using **`strategies:
'injectManifest'`** with a hand-written worker at [`src/sw/sw.ts`](src/sw/sw.ts).

- App name: "Finio - Finance Tracker", theme color `#6C63FF`
- Manifest icons: 64px, 96px, 192px, 512px, maskable 512px (in `public/`)
- `shortcuts`: Add Expense, Add Income, Transactions, Budgets (96px icon each)
- `share_target`: `GET /share-target?title=&text=&url=` — GET is forced, not preferred:
  `public/.htaccess` rewrites to a static `index.html` and cannot take a POST body, and a POST
  target also needs the SW to already be controlling, which it isn't on a cold-start share
- Notification schedule and fired-reminder ledger live in IndexedDB (`finio-notifications`), the
  only storage the page and the worker can both reach

**The worker is hand-written, so nothing is free.** `workbox.runtimeCaching`, `navigateFallback`,
`cleanupOutdatedCaches` and `clientsClaim` are all `generateSW`-only options that `injectManifest`
**ignores silently, with no error**. `sw.ts` writes each of them out; the one that matters most is
the `NavigationRoute` SPA fallback, without which offline deep-links to `/settings` or `/budgets`
404. `registerType: 'autoUpdate'` additionally requires `self.skipWaiting()` and `clientsClaim()`
literally present in the worker source or updates stall behind a waiting worker.

The worker needs the **WebWorker** lib while the app needs **DOM**, so it is its own TS project:
[`tsconfig.sw.json`](tsconfig.sw.json) is in the root `references` *and* `src/sw` is excluded from
`tsconfig.app.json`. Missing either half breaks `npm run build`. The `workbox-*` runtime packages
are explicit devDependencies — they previously resolved only through npm hoisting `workbox-build`.

`virtual:pwa-register` is deliberately never imported: `tsconfig.app.json` declares only
`["vite/client"]` and there is no `vite-env.d.ts`, so it is a hard `tsc -b` break.
`navigator.serviceWorker.ready` covers every need. **The PWA is not built under `vite dev`** — use
`npm run build && npm run preview` (there is a `finio-preview` launch config).

---

## Code Splitting

Vite manual chunks defined in [vite.config.ts](vite.config.ts):
- `vendor-react` — react, react-dom, react-router
- `vendor-charts` — recharts + d3-*
- `vendor-dates` — date-fns
- `vendor-icons` — lucide-react

All page components are lazy-loaded. This keeps the initial bundle small.

---

## Adding a New Feature — Checklist

1. **New type?** → add interface to `src/types/index.ts`
2. **New state?** → extend `useFinanceStore` (add state + actions + localStorage key); bump migration version if changing the persisted schema
3. **New page?** → create in `src/pages/`, add a lazy `import()` in `App.tsx`, wire up the route
4. **New API call?** → add a typed function to `src/services/api.ts`
5. **New UI primitive?** → prefer `npx shadcn@latest add` over hand-rolling
6. **New calculation?** → add to `src/utils/calculations.ts` and export a named function
7. **New money logic?** → keep it pure and add a `*.test.ts` beside it. Anything touching `window`,
   `Notification` or IndexedDB has to be split into a tested pure module and an untested I/O
   wrapper — the suite runs in `node` (see Key Commands)
8. **New entity?** → also wire it into `services/backup.ts` (export + upload) and
   `utils/importValidation.ts`, or it silently drops out of every backup

---

## Common Gotchas

- **Transfers are special:** `TransactionType.transfer` uses both `accountId` (source) and `toAccountId` (destination). Balance calculations must handle this pair atomically.
- **Balances are derived, not authoritative:** `Account.openingBalance` is the source of truth and `Account.balance` is a cache of `openingBalance + Σ(transaction deltas)`, kept up to date incrementally by `applyBalanceDelta`. Anything that mutates transactions in bulk must either apply deltas or call `recomputeAccountBalances()`. Setting `balance` via `updateAccount` shifts `openingBalance` by the same amount so the invariant survives a reconcile — pass `openingBalance` explicitly to override that.
- **Imports are validated, never trusted:** route every backup (file *or* cloud) through `validateBackup()` before `importData()`. It drops malformed rows, dedupes ids, strips unknown settings keys, and produces the report the Settings preview dialog renders.
- **INR only:** Multi-currency was removed in persisted-schema v4. `formatCurrency(amount, compact?)` hardcodes INR/`en-IN`; there is no per-account or per-setting currency field. Old persisted state and old backup JSON are stripped of the legacy `currency` key on load and on import.
- **"This month" is a financial month:** every month window comes from `src/utils/period.ts` and starts on `Settings.monthStartDay` (1–28, default 1), so a 25th-of-the-month salary cycle runs 25 Jun–24 Jul. Never call `startOfMonth`/`endOfMonth` directly in feature code — use `periodRange`/`monthPeriodStart` (or `getCurrentMonthTransactions(txns, monthStartDay)`) or the app will disagree with itself.
- **Budget scope and period:** a `Budget` is scoped by `labelId` if set, otherwise by `categoryId` (`''` = overall across all expenses) — `budgetScopeKey()` is the identity, and `addBudget` replaces any budget sharing it. Each budget carries its own `period`, so `computeBudgetStatuses(budgets, transactions, { monthStartDay })` takes the *full* transaction list and slices per budget. With `rollover`, `status.limit` is `amount + carryover` (carryover is signed — an overspend carries forward as a debt) and the chain never reaches back past the budget's `createdAt` period, capped at `MAX_ROLLOVER_LOOKBACK`.
- **Auto-categorization is first-match-wins and never destructive:** the order of `rules` in the
  store *is* their priority, so anything that rewrites the array (reorder, import merge) changes
  which rule fires. Every consumer goes through [`src/utils/autoCategorize.ts`](src/utils/autoCategorize.ts)
  — never re-implement matching. Two invariants the engine enforces and callers must not work
  around: a rule never fires on a `transfer`, and never touches a transaction with `splits`.
  Rule labels are additive (`mergeLabels`), and a user-typed regex is compiled defensively — an
  invalid one matches nothing rather than throwing. On CSV import, a category the file itself
  supplied always outranks a rule.
- **Recurring processing:** Call `processRecurring()` (from `useFinanceStore`) when the app mounts or resumes from background to generate any overdue recurring transactions. `planRecurring` skips paused rules, stops at `endDate` and `maxOccurrences`, and requires both accounts to exist for a transfer rule. Before saving a rule dated in the past, preview it with `previewBackfill()` — "start from today" is expressed as `lastRunDate = lastOccurrenceOnOrBefore(rule, now)`, which keeps the cadence anchored to `startDate` while skipping the history.
- **Net worth history is snapshotted, not recomputed:** balances are derived, so every past
  net-worth value is only as stable as the transaction list behind it — deleting an old row rewrites
  the whole reconstructed trend. `captureNetWorthSnapshots()` (called from `Layout` on hydration,
  after `processRecurring`) freezes each financial month as it closes, and
  [`src/utils/netWorth.ts`](src/utils/netWorth.ts) prefers a snapshot over reconstruction for any
  closed month. Only *completed* months are ever captured, the month in progress is always live, and
  `periodKey` — not `id` — is a snapshot's real identity, which is why `importData` dedupes on it.
- **The forecast models liquid cash only:** [`src/utils/forecast.ts`](src/utils/forecast.ts) projects
  open, non-credit accounts. Card spending contributes nothing until the payment transfer leaves an
  account, and an internal transfer nets to zero — `liquidDelta()` is the single place that rule
  lives. Anything counted in the recurring projection must stay out of the category-average estimate
  (that is what the `recurringId` filter is for), or every subscription is billed twice.
- **Insight copy never formats money itself:** `buildInsights()` takes a `formatAmount` callback so
  the feed honours `Settings.hideAmounts`. Comparisons against the current month are always
  pace-adjusted via `paceToFullPeriod`, or a month three days old reads as a spending collapse.
  A subscription candidate's `nextDate` is guaranteed to be in the future, so accepting the offered
  recurring rule can never backfill charges that are already in the ledger.
- **A reminder's id is its dedupe contract:** the schedule is rebuilt from scratch on every app
  open, so `buildNotificationSchedule` must produce byte-identical ids each time or every
  reminder fires again on the next launch. Ids are keyed on the *occurrence* — the due date, or
  `range.start` for a budget period — and **never** on `fireAt`, which is why changing the lead
  time cannot re-send anything. Budget ids carry the severity too, so `near` → `over` is a
  second reminder rather than a swallowed one. The fired ledger lives in IndexedDB, not the
  store, because a service worker cannot touch localStorage and the two contexts would otherwise
  re-fire each other's reminders; `claimFired` relies on IDB `add()` rejecting a duplicate key to
  make the claim atomic, which also covers StrictMode's double mount.
- **The service worker cannot read localStorage,** where all the finance data lives. It only ever
  reads the precomputed schedule out of IndexedDB. Any new trigger must be baked in by the app —
  which is also why budget alerts are foreground-only everywhere: they derive from `transactions`.
- **App lock config must never touch `Settings`:** [`src/services/backup.ts`](src/services/backup.ts)
  serializes `settings` into every exported JSON and every cloud upload, so a PIN hash there would
  travel off-device — and `importData` merging that backup onto another machine would silently
  install this device's PIN on it. It lives in [`useAppLockStore`](src/store/useAppLockStore.ts)
  (`finio-lock`) instead, which makes both impossible with no scrubbing code and means
  `resetToDefaults()` cannot unlock the app. A test asserts no `/pin|lock/i` key ever appears in
  `defaultSettings`. Note also: the lock is a **screen gate, not encryption** — the data behind it
  is still plaintext, the UI says so, and no amount of PBKDF2 iterations changes it.
- **The lock gate must stay above `<Routes>` and must never navigate.** That is the only reason a
  share target, a manifest shortcut or a notification click survives it: nothing on that path
  touches `window.location`, so the URL is intact when the gate lifts. A `history.replaceState`
  that strips query params from a top-level effect is the one realistic way to break this — do
  param cleanup inside a route component. The same applies to the onboarding gate.
- **The backup passphrase is subject to the same rule as the PIN,** and for a sharper reason: key
  material inside the payload it protects defeats the point. `BackupCryptoConfig` lives in
  [`useBackupCryptoStore`](src/store/useBackupCryptoStore.ts) (`finio-backup-crypto`), and the
  derived `CryptoKey` is cached **in memory only, for the session** — it is never persisted
  anywhere. The salt travels inside each uploaded envelope, so a restore on a brand-new device
  with no local config can still derive the key and self-heal its config from it. Automatic
  background uploads **skip silently** when no session key is cached (never prompt unattended);
  Settings shows a "Cloud backup locked" banner instead. There is deliberately no passphrase
  recovery.
- **A split transaction has no `categoryId`.** When `Transaction.splits` is present, `categoryId`
  is `''` — every aggregation must go through `transactionCategoryAmounts()` in
  [`src/utils/calculations.ts`](src/utils/calculations.ts) rather than reading `categoryId`.
  A category budget counts only the matching portion; overall and label budgets count the full
  amount.
- **Goals and debts are manual ledgers, not transactions.** `GoalContribution` and `DebtEntry` sit
  beside accounts, so logging "I lent ₹500" can never corrupt a real balance. The one exception is
  **Settle up** on the Debts page, which atomically creates a real `Transaction` *and* a balancing
  `DebtEntry` stamped with `settledTransactionId`. Deleting a goal or a person cascades its
  entries; deleting an account clears `Goal.linkedAccountId` rather than orphaning it.
- **Archived is not deleted:** `Account.archivedAt` closes an account while keeping its
  transactions, balance and recurring rules. `activeAccounts()` gates every running total, and the
  account disappears from pickers — *except* on a transaction already sitting on it, so editing
  history can't silently reassign it.
- **Auth state:** Always call `useAuthStore.getState().loadAuth()` (or rely on Zustand hydration) before making authenticated API calls.
- **Tailwind v4:** There is no `tailwind.config.js`. All customizations go in CSS files using `@theme`, `@layer`, etc.

---

## Backend Setup (Self-Hosting)

See [README.md](README.md#self-hosting-the-backend) (or `backend/SETUP_GUIDE.txt`) for the full 11-step guide. Quick summary:

1. Copy `backend/config.example.php` → `backend/config.php` and fill in DB credentials, JWT secret (32+ chars), SMTP settings, and `backup_dir` path.
2. Run `composer install` inside `backend/`.
3. Import `backend/schema.sql` into your MySQL database.
4. Point your web server's document root to `backend/public/`.
5. Set `VITE_API_URL` in the frontend `.env` to your backend URL.
