# Finio Web — CLAUDE.md

## Project Overview

**Finio** is a privacy-first personal finance PWA (Progressive Web App). It is fully offline-capable — all data lives in browser localStorage via Zustand. The optional PHP backend adds JWT-authenticated cloud backup only; the app works entirely without it.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- **Backend (optional):** PHP 8+ with MySQL, JWT auth, and email OTP

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

Tests live next to their subject as `*.test.ts` and cover the pure money logic
(`src/store/balance.ts`, `src/store/recurring.ts`, `src/utils/calculations.ts`,
`src/utils/period.ts`, `src/utils/importValidation.ts`, `src/utils/csvImport.ts`,
`src/utils/autoCategorize.ts`, `src/utils/analytics.ts`, `src/utils/forecast.ts`,
`src/utils/netWorth.ts`, `src/utils/insights.ts`) plus the store itself. Config is in `vitest.config.ts` — separate
from `vite.config.ts` and running in the `node` environment, so no browser plugins are loaded.

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
├── App.tsx                   # BrowserRouter, lazy routes, Layout, Suspense, Sonner toasts
├── pages/                    # Route-level components (all lazy-loaded)
│   └── auth/                 # Login, Register, VerifyOtp, ForgotPassword, ResetPassword
├── components/
│   ├── ui/                   # shadcn/ui primitives (button, input, dialog, calendar, etc.)
│   ├── charts/               # Recharts wrappers (BalanceTrend, SpendingDonut, etc.)
│   ├── analytics/            # Analytics-page cards (forecast, net worth, heatmap, insights)
│   ├── layout/Layout.tsx     # Shell for authenticated pages
│   ├── ProtectedRoute.tsx    # Auth guard (redirects to /login if no token)
│   └── ThemeProvider.tsx     # dark/light/system theme context
├── store/
│   ├── useFinanceStore.ts    # All finance data + actions (Zustand + localStorage)
│   ├── balance.ts            # Pure balance math: deltas, opening-balance backfill, recompute
│   ├── recurring.ts          # Pure recurring planner (planRecurring, nextDueDate, previewBackfill)
│   └── useAuthStore.ts       # Token, user profile, lastBackupAt (Zustand + localStorage)
├── services/
│   ├── api.ts                # Typed fetch wrapper, Bearer token injection
│   └── backup.ts             # Cloud upload/download + local JSON export/import
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
│   └── formatters.ts         # Currency (INR), date, number formatting
├── lib/utils.ts              # shadcn cn() helper
└── data/defaultData.ts       # Default categories, labels, and settings
```

### State Management

Two Zustand stores, both persisted to localStorage:

- **`useFinanceStore`** — accounts, transactions, categories, labels, budgets, recurring rules, settings. Exposes granular selector hooks (`useAccounts()`, `useTransactions()`, etc.) to avoid re-renders. Includes `processRecurring()` for generating due recurring transactions, `importData(payload, { mode })` for merge/replace restore, `captureNetWorthSnapshots()` for the monthly net-worth ledger, and `recomputeBalances()` to reconcile drift. Has migration support (currently v12).
- **`useAuthStore`** — JWT token, user object, `lastBackupAt`. Use `loadAuth()` on app start to hydrate from storage.

### Routing

React Router v7. All pages are lazy-loaded (dynamic `import()`). Route structure:

- `/` — Dashboard (index, protected)
- `/accounts`, `/transactions`, `/analytics`, `/settings`, `/budgets`, `/recurring` — protected
- `/add-transaction`, `/edit-transaction/:id`, `/add-account`, `/edit-account/:id` — protected
- `/manage-categories`, `/manage-labels`, `/category-rules` — protected
- `/goals`, `/debts`, `/import-csv` — protected
- `/login`, `/register`, `/verify-otp`, `/forgot-password`, `/reset-password` — public auth routes
- `*` → redirects to `/`

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
│       ├── AuthController.php    # register, verify-otp, login, forgot/reset-password
│       ├── UserController.php    # /user/me
│       └── BackupController.php  # upload, list, latest, get-by-date, delete
├── composer.json             # firebase/php-jwt + phpmailer/phpmailer
├── config.example.php        # Template — copy to config.php and fill in
├── schema.sql                # MySQL schema (users + backups tables)
└── SETUP_GUIDE.txt           # 11-step self-hosting guide
```

**API base:** `VITE_API_URL` (e.g. `https://api.yourdomain.com`)

Key endpoints:
- `POST /auth/register` → sends OTP email
- `POST /auth/verify-otp` → returns `{ token, user }`
- `POST /auth/login` → returns `{ token, user }`
- `GET  /backup/latest` *(auth required)*
- `POST /backup/upload` *(auth required, JSON body)*

---

## Domain Types

Defined in [src/types/index.ts](src/types/index.ts):

| Type | Key fields |
|------|-----------|
| `Account` | id, name, type, color, icon, balance, openingBalance, creditLimit? |
| `Transaction` | id, type, amount, accountId, toAccountId?, categoryId, date, labels[], recurringId? |
| `Category` | id, name, icon, color, type |
| `Label` | id, name, color |
| `Budget` | id, categoryId ('' = overall budget), labelId?, amount, period, rollover |
| `RecurringTransaction` | id, type, amount, accountId, toAccountId?, categoryId, frequency, startDate, endDate?, maxOccurrences?, occurrenceCount, pausedAt?, lastRunDate |
| `CategoryRule` | id, pattern, matchType, scope, categoryId, labelIds[], enabled |
| `NetWorthSnapshot` | id, periodKey (`yyyy-MM`), date, assets, liabilities |
| `Settings` | theme, userName, autoLocalBackup, monthStartDay |

Enums: `AccountType`, `TransactionType` (expense/income/transfer), `RecurrenceFrequency` (daily/weekly/monthly/yearly), `BudgetPeriod` (weekly/monthly/yearly), `RuleMatchType` (contains/startsWith/endsWith/equals/regex), `RuleScope` (expense/income/any), `Theme` (dark/light/system).

---

## UI & Styling

- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`; directives in `index.css`).
- **shadcn/ui** with `base-nova` style, using `@base-ui/react` under the hood. Add new components with `npx shadcn@latest add <component>`.
- **Lucide React** for icons.
- **Sonner** for toast notifications (mounted in `App.tsx`).
- **Recharts** for all charts in the Analytics page.
- **@tanstack/react-virtual** for the virtualized transactions list.

---

## PWA

Configured in [vite.config.ts](vite.config.ts) via `vite-plugin-pwa`:

- App name: "Finio - Finance Tracker", theme color `#6C63FF`
- Workbox pre-caches all JS/CSS/HTML assets; Google Fonts use CacheFirst strategy
- Manifest icons: 64px, 192px, 512px, maskable 512px (in `public/`)

---

## Code Splitting

Vite manual chunks defined in [vite.config.ts](vite.config.ts):
- `vendor-react` — react, react-dom, react-router-dom
- `vendor-charts` — recharts
- `vendor-date` — date-fns
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
- **Auth state:** Always call `useAuthStore.getState().loadAuth()` (or rely on Zustand hydration) before making authenticated API calls.
- **Tailwind v4:** There is no `tailwind.config.js`. All customizations go in CSS files using `@theme`, `@layer`, etc.

---

## Backend Setup (Self-Hosting)

See `backend/SETUP_GUIDE.txt` for the full 11-step guide. Quick summary:

1. Copy `backend/config.example.php` → `backend/config.php` and fill in DB credentials, JWT secret (32+ chars), SMTP settings, and `backup_dir` path.
2. Run `composer install` inside `backend/`.
3. Import `backend/schema.sql` into your MySQL database.
4. Point your web server's document root to `backend/public/`.
5. Set `VITE_API_URL` in the frontend `.env` to your backend URL.
