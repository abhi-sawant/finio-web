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
```

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
│   ├── layout/Layout.tsx     # Shell for authenticated pages
│   ├── ProtectedRoute.tsx    # Auth guard (redirects to /login if no token)
│   └── ThemeProvider.tsx     # dark/light/system theme context
├── store/
│   ├── useFinanceStore.ts    # All finance data + actions (Zustand + localStorage)
│   └── useAuthStore.ts       # Token, user profile, lastBackupAt (Zustand + localStorage)
├── services/
│   ├── api.ts                # Typed fetch wrapper, Bearer token injection
│   └── backup.ts             # Cloud upload/download + local JSON export/import
├── types/index.ts            # All domain interfaces (Account, Transaction, Budget, etc.)
├── utils/
│   ├── calculations.ts       # Financial aggregations, budget status, CSV export
│   └── formatters.ts         # Currency, date, number formatting
├── lib/utils.ts              # shadcn cn() helper
└── data/defaultData.ts       # Default categories, labels, and settings
```

### State Management

Two Zustand stores, both persisted to localStorage:

- **`useFinanceStore`** — accounts, transactions, categories, labels, budgets, recurring rules, settings. Exposes granular selector hooks (`useAccounts()`, `useTransactions()`, etc.) to avoid re-renders. Includes `processRecurring()` for generating due recurring transactions and `importData()` for bulk restore. Has migration support (currently v3).
- **`useAuthStore`** — JWT token, user object, `lastBackupAt`. Use `loadAuth()` on app start to hydrate from storage.

### Routing

React Router v7. All pages are lazy-loaded (dynamic `import()`). Route structure:

- `/` — Dashboard (index, protected)
- `/accounts`, `/transactions`, `/analytics`, `/settings`, `/budgets`, `/recurring` — protected
- `/add-transaction`, `/edit-transaction/:id`, `/add-account`, `/edit-account/:id` — protected
- `/manage-categories`, `/manage-labels` — protected
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
| `Account` | id, name, type, currency, color, icon, balance, creditLimit? |
| `Transaction` | id, type, amount, accountId, toAccountId?, categoryId, date, labels[], recurringId? |
| `Category` | id, name, icon, color, type |
| `Label` | id, name, color |
| `Budget` | id, categoryId ('' = overall budget), amount |
| `RecurringTransaction` | id, type, amount, accountId, categoryId, frequency, startDate, lastRunDate |
| `Settings` | currency, theme, userName, autoLocalBackup |

Enums: `AccountType`, `TransactionType` (expense/income/transfer), `Currency` (USD/EUR/GBP/INR/JPY/CAD/AUD), `RecurrenceFrequency` (daily/weekly/monthly/yearly), `Theme` (dark/light/system).

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
- **Currency is per-account:** Each `Account` has its own `currency`. `Settings.currency` is only the *display* currency for aggregated totals — conversion logic is in `formatters.ts`.
- **Overall budget:** A `Budget` with `categoryId === ''` means it applies to all spending (overall budget), not a category budget.
- **Recurring processing:** Call `processRecurring()` (from `useFinanceStore`) when the app mounts or resumes from background to generate any overdue recurring transactions.
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
