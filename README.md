# Finio — Personal Finance Tracker

**Your money, on your device.** Finio is a privacy-first personal finance app that runs entirely
in your browser. Every rupee you record stays in local storage on your phone or laptop — there is
no account to create, no server watching, and no analytics of any kind. Cloud backup exists, it is
opt-in, and it can be end-to-end encrypted so even the backup server can't read it.

**Try it now: [finio.slowatcoding.com](https://finio.slowatcoding.com)** — nothing to install, no
sign-up, works offline the moment it loads.

This README has two halves:

- **[Part 1 — For Everyone](#part-1--for-everyone)** — what Finio does and how to use it.
- **[Part 2 — For Developers](#part-2--for-developers)** — running it locally and self-hosting the
  optional backend.

---

# Part 1 — For Everyone

## Why Finio

Most finance apps ask you to hand over your bank login and then monetize what they learn. Finio
takes the opposite approach: it is a plain web app that keeps a ledger for you, and that's it.

|  | What it means |
|---|---|
| **Offline-first** | All data lives in your browser's local storage. Turn off the internet and the app still works completely. |
| **No account required** | You can use every feature — accounts, budgets, goals, analytics, reminders — without ever signing up. |
| **Zero tracking** | No analytics, no telemetry, no third-party scripts. |
| **Installable** | Add it to your home screen on Android or iOS, or install it on desktop. It opens like a native app, no browser bars. |
| **Optional encrypted backup** | If you want your data on more than one device, turn on cloud backup — and optionally encrypt it with a passphrase only you know. |
| **Rupee-native** | Amounts are in INR, formatted the Indian way (₹1,22,999, and ₹1.2L / ₹1.2Cr where space is tight). |

---

## Getting Started

The first time you open Finio, a short wizard asks for your name, your first account, and its
current balance. You can skip past the account step — handy if you're reinstalling and want to go
straight to Settings and restore a backup.

After that:

1. **Add a transaction** — tap the **+** button. Pick Expense, Income, or Transfer, punch in the
   amount on the number pad, choose the account and category, add a note, and save.
2. **Set a budget** — Settings → Budgets → **+**. Pick a category (or "Overall"), a limit, and
   whether it resets weekly, monthly, or yearly.
3. **Automate the regulars** — Settings → Recurring → **+** for rent, salary, subscriptions. Finio
   files them for you.
4. **Watch it come together** — the Analytics tab fills in as your history grows.

**Two shortcuts worth knowing early:** long-press the **+** button to re-add a saved template in
one tap, and long-press any transaction row for Duplicate / Save as template / Select / Delete.

---

## Installing the App

**Android (Chrome / Edge)** — open the app, tap the ⋮ menu → **Add to Home Screen** → **Install**.

**iPhone / iPad (Safari)** — open the app, tap **Share** → **Add to Home Screen** → **Add**.

**Desktop (Chrome / Edge)** — click the install icon in the address bar, or menu → **Install
Finio**.

Once installed you also get **home-screen shortcuts** (long-press the icon for Add Expense, Add
Income, Transactions, Budgets) and Finio appears in your phone's **share sheet** — share a payment
SMS or a note to it and the Add Transaction screen opens with the amount already filled in.

---

## What's Inside

### Dashboard

Your financial state in one screen: total balance across your spending accounts, an "after dues"
figure that subtracts credit card outstanding, this month's income and expenses with a comparison
against last month, and a scrollable row of your account cards.

Below that, only what needs your attention appears:

- **Budget alerts** when a budget passes 85% or goes over.
- **Card Payments Due** when a credit card statement payment lands within a week.
- **Upcoming Bills** — recurring transactions due in the next 7 days.
- **Savings Goals** in progress and **Debts & Lending** balances still open.
- Your top spending categories this month, and your most recent transactions.

### Accounts

Six account types — Checking, Savings, Cash, Credit, Investment, Wallet — each with its own name,
icon, and colour.

Credit cards get a full lifecycle: a credit limit with a utilization reading, plus an optional
statement cycle (close day, days until payment is due, minimum-due percentage). Set it once and
Finio tracks the due date and warns you before it arrives.

Closed an account? **Archive** it rather than deleting. Archived accounts keep every transaction
and drop out of your totals and pickers, and you can restore them any time. Deleting is still
available, and the confirmation tells you exactly how many transactions would go with it.

### Transactions

The full ledger, grouped by date and virtualized so it stays fast with tens of thousands of rows.

- **Search** across notes, categories, both sides of a transfer, labels, and amounts — typing
  `₹1,200` finds `1200`.
- **Filter** by type, account, and date range.
- **Split one expense across categories** — a ₹3,000 supermarket run can be ₹2,200 Food and ₹800
  Household, and both budgets see their share.
- **Bulk actions** — select multiple rows to add a label, recategorize, or delete them together.
- **Templates and duplicates** — save any transaction's shape and re-add it in a tap.
- **CSV export** of whatever the current filter shows.
- Deleting a transaction doesn't nag you with a dialog; it shows an **Undo** toast instead.

### Budgets

Budgets can be **overall** (all spending), **per category**, or **per label**, and each one runs on
its own **weekly, monthly, or yearly** cycle.

Turn on **rollover** and unspent money carries into the next period, envelope-style — and an
overspend carries forward as a debt, which is the honest version. Every budget card shows a
progress bar with a plain-language badge (On track / Near limit / Over budget) and a collapsible
history so you can see whether you actually hit it last month.

### Savings Goals

Set a target amount and an optional deadline, then log contributions and withdrawals against the
goal. Finio shows the percentage complete, what's left, and — once it has enough history — a
projected completion date based on your actual pace.

Goal contributions are their own ledger, deliberately separate from your accounts, so tracking a
goal can never accidentally move a real balance.

### Debts & Lending

Track who owes you and who you owe, per person. Log entries as **They owe me** or **I owe them**,
and see each person's running balance.

**Settle up** is the one moment real money moves: enter the amount and the account, and Finio
creates a genuine income or expense transaction *and* balances the person's ledger in one step.

### Recurring Transactions

Rules for daily, weekly, monthly, or yearly income, expenses, or transfers. Open the app after a
week away and everything you missed is filed automatically.

Rules are fully editable — pause and resume them, set an end date or a maximum number of
occurrences, and see "next due", "3 of 12", or "until 31 Dec" on each card. Create a rule dated in
the past and Finio asks first, showing you exactly how many transactions it would add and their
total, so you can add them or just start from today.

### Analytics

Filter by this month, last 3 or 6 months, this year, all time, or a custom range, then explore:

| | |
|---|---|
| **Insights feed** | Plain-language observations — a category running above its 3-month average, a budget on pace to blow past its limit, a savings rate worth noticing. It also spots **subscriptions** hiding in your history and offers to turn them into recurring rules. |
| **Cash-flow forecast** | Projects your liquid cash 30 / 60 / 90 days ahead from your recurring bills and your everyday spending, flags the low point, and names the date you'd run dry. |
| **Net worth over time** | A trend line that freezes each month as it closes, so editing old history doesn't silently rewrite your past. |
| **Compare periods** | This period vs. the last one vs. the same one a year ago, with the biggest category swings ranked. An in-progress period is labelled as such and shows what it's on pace for. |
| **Spending heatmap** | A calendar of your spending, month by month, with the busiest day called out. |
| **Charts** | Spending by category, income vs. expenses, balance trend, and spending by label. |

Every chart has a **View data table** toggle — the same numbers as plain text, for screen readers
or for anyone who'd rather read the figures than the picture.

### Categories, Labels, and Rules

**23 built-in categories** and **9 built-in labels** ship with the app, and you can add, edit, or
delete any of them. Categories have an icon, a colour, and a type (expense, income, or both);
labels are free-form tags you can stack on any transaction.

**Categorization rules** file transactions for you. "If the note contains *Uber*, make it Transport
and tag it Essential." Rules run as you type a note (with an Undo right there in the banner),
during CSV import, and on demand over your existing history — with a live count of what would
change before you commit, and a single-tap undo after.

### Import from Your Bank

Settings → **Import from CSV** walks a bank statement through three steps: upload, map the columns,
review. Finio auto-detects the date, amount, and note columns and the date format; handles either a
single signed amount column or separate debit/credit columns; understands currency symbols,
thousand separators, and accounting-style parentheses; and flags likely duplicates against what's
already in your ledger before anything is added.

### Reminders

Optional local notifications for bills coming due, budgets crossing their limit, and credit card
payments — with your own lead time of up to 7 days. Nothing is on until you turn it on.

On Android these can arrive while the app is closed. On iOS and Firefox they arrive the next time
you open the app, and the Settings screen says so plainly rather than pretending otherwise.

### App Lock

Lock Finio behind a 4- or 6-digit PIN, with optional face or fingerprint unlock, and auto-lock
after 0, 1, 5, 15, or 60 minutes in the background. Repeated wrong PINs trigger a growing delay.

Finio is straight with you about what this is: **a screen gate, not encryption.** Your data behind
it is still stored unencrypted, and there is deliberately no wipe-after-N-attempts, because in a
local-only app that turns a forgotten PIN into permanent data loss.

### Backups

Finio gives you four ways to not lose your data, and you can use any combination:

1. **Export / Import a JSON file** — no account needed. Every import runs a dry-run preview first,
   showing you exactly what will be accepted, what's malformed, and what references are missing,
   then lets you **Merge** or **Replace**.
2. **Automatic daily local backup** — Finio downloads a backup file once a day when you open it.
   On supporting browsers you can point it at a folder and it keeps the 10 most recent, tidying up
   the older ones for you.
3. **Cloud backup** — register with an email, verify the OTP, and Finio uploads a backup once a
   day. **Backup History** lists every version by date and size so you can restore or delete a
   specific one.
4. **End-to-end encrypted cloud backup** — turn on a passphrase and your backup is encrypted in
   your browser before it ever leaves. The server stores an opaque blob. Nobody who has the server
   can read your finances. There's no passphrase recovery, because that's the whole point.

### Settings

Everything above is configured from one screen: display name, theme (light / dark / follow
system), **hide amounts** (masks every figure app-wide behind dots when you're in public), the day
your financial month starts (1–28, so a 25th-of-the-month salary cycle really runs 25 Jun – 24
Jul), reminders, app lock, cloud account and password, encryption, backups, CSV import, and
category / label / rule management.

There's also **Reconcile Balances**, which rebuilds every account balance from its opening balance
and its transactions and reports what it corrected — a safety net you'll probably never need.

---

## Frequently Asked

**Do I need an account?** No. Every feature works signed out. An account only adds cloud backup.

**Where is my data?** In your browser's local storage on that device. Clearing your browser data
for the site deletes it — which is why the backup options above are worth setting up.

**Can I use it on two devices?** Yes, via cloud backup: back up on one, restore on the other. Finio
doesn't do live sync between devices.

**Does it connect to my bank?** No. You add transactions manually, or import a CSV statement.

**Is it free?** Yes, and the source is here.

---

---

# Part 2 — For Developers

Finio is a React 19 + TypeScript PWA. The optional backend is a small PHP 8 app built to run on
ordinary cPanel shared hosting.

**You do not need the backend.** The frontend is a complete application on its own; the backend
only adds user accounts and cloud backup storage.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 (no config file — `@theme` in CSS) |
| UI components | shadcn/ui (`base-nova`) on Base UI |
| State | Zustand 5, persisted to `localStorage` |
| Routing | React Router 7 (`react-router`) |
| Charts | Recharts 3 |
| Dates | date-fns 4 |
| Virtual scrolling | @tanstack/react-virtual |
| CSV | papaparse |
| Icons | Lucide React |
| Tests | Vitest (node environment) |
| PWA | vite-plugin-pwa with `injectManifest` + a hand-written Workbox service worker |
| Backend | PHP 8 + Composer |
| Auth | firebase/php-jwt (30-day tokens) |
| Email | PHPMailer over SMTP |
| Database | MySQL |

## Local Development

**Requirements:** Node.js 18+ and npm.

```bash
git clone https://github.com/abhi-sawant/finio-web.git
cd finio-web
npm install
npm run dev
```

The app runs at `http://localhost:5173`. With no `.env`, the API client points at the hosted
backend — irrelevant unless you sign in.

### Scripts

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build → dist/
npm run preview      # Serve the production build (required to exercise the PWA)
npm test             # Vitest, single run
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
npm run format       # Prettier (with the Tailwind class-sorting plugin)
npm run format:check # Check formatting without writing
```

### Tests

463 tests across 22 files, living next to their subjects as `*.test.ts`. They cover the pure money
logic — balance deltas and reconciliation, the recurring planner, budget status and rollover,
period math, backup validation, CSV parsing, the categorization engine, forecasting, net worth,
insights, the notification schedule, PIN and backup crypto — plus the finance, app-lock, and
backup-crypto stores.

`vitest.config.ts` is deliberately separate from `vite.config.ts` and runs in the **node**
environment: no jsdom, no setup file, and `include` matches `.test.ts` only. That's a real
constraint — `window`, `Notification`, and IndexedDB don't exist, so anything platform-facing has
to be split into a pure module (tested) and a thin I/O wrapper (not). Node does provide
`crypto.subtle`, which is why the PIN and backup crypto are fully testable.

### A Few Things That Will Bite You

Read [CLAUDE.md](CLAUDE.md) for the full set. The short version:

- **Balances are derived.** `Account.openingBalance` is the source of truth; `balance` is a cache
  of `openingBalance + Σ(deltas)`. Bulk mutations must apply deltas or call `recomputeBalances()`.
- **"This month" is a financial month.** Never call `startOfMonth`/`endOfMonth` in feature code —
  go through `src/utils/period.ts`, which honours `Settings.monthStartDay`.
- **The PWA doesn't run under `vite dev`.** Use `npm run build && npm run preview`.
- **The service worker is hand-written.** `runtimeCaching`, `navigateFallback`,
  `cleanupOutdatedCaches`, and `clientsClaim` are `generateSW`-only options that `injectManifest`
  ignores *silently*. `src/sw/sw.ts` writes them all out by hand; the SPA navigation fallback is
  the one that matters most.
- **Never put secrets in `Settings`.** It's serialized into every export and cloud upload. The PIN
  hash and backup-encryption config live in their own stores for exactly this reason.
- **New entity?** Wire it into `services/backup.ts` and `utils/importValidation.ts` too, or it
  silently drops out of every backup.

### Project Layout

```
finio-web/
├── src/
│   ├── App.tsx              # Router + the hydration / lock / onboarding gates
│   ├── pages/               # One file per route, all lazy-loaded
│   ├── components/          # ui/ charts/ analytics/ applock/ onboarding/ layout/ …
│   ├── sw/sw.ts             # Hand-written service worker (its own TS project)
│   ├── store/               # Zustand stores + pure balance/recurring modules
│   ├── services/            # API client, backup, notifications, app lock
│   ├── utils/               # All the pure logic (and all the tests)
│   ├── types/index.ts       # Every domain interface
│   └── data/defaultData.ts  # Default categories, labels, settings
├── backend/                 # Optional PHP API (see below)
├── public/                  # PWA icons, .htaccess
├── vite.config.ts           # Vite + PWA manifest + chunk splitting
├── vitest.config.ts         # Test config (node environment)
└── tsconfig.sw.json         # Separate TS project for the service worker
```

### Deploying the Frontend

```bash
npm run build
```

Deploy `dist/` to any static host. Because it's an SPA, the host must rewrite unknown paths to
`index.html` — `public/.htaccess` does this for Apache/cPanel; on Netlify, Vercel, or Nginx use
their equivalent.

---

## Self-Hosting the Backend

> **Optional.** The live app at [finio.slowatcoding.com](https://finio.slowatcoding.com) already
> runs a working backend — create a free account and you're done. Self-host only if you want your
> backup data on infrastructure you control.
>
> Worth knowing: with **encrypted cloud backup** turned on, the server only ever holds an opaque
> encrypted blob, so self-hosting isn't the only way to keep the operator out of your data.

The backend is a single-entry-point PHP app designed for **cPanel shared hosting** (MilesWeb,
Hostinger, SiteGround, and similar). It provides JWT auth, email OTP verification, and JSON backup
storage. No prior PHP or server experience is required.

**Estimated time: ~45 minutes.** `backend/SETUP_GUIDE.txt` has the same steps in plain text.

### Prerequisites

- A cPanel hosting account with PHP 8.0+, MySQL, and Composer (or Terminal access to install it)
- An email account on your domain, for sending OTPs
- A subdomain for the API (e.g. `api.yourdomain.com`)

### Step 1 — Create the MySQL database

1. Log in to cPanel (usually `https://yourdomain.com:2083`).
2. **Databases → MySQL® Databases**.
3. Create a database named `finio`. cPanel prefixes it with your username (e.g. `johndoe_finio`).
   Note the full name.
4. Under **MySQL Users**, create `finiouser` with a strong password (full name:
   `johndoe_finiouser`). Save the password.
5. Under **Add User to Database**, grant `johndoe_finiouser` **ALL PRIVILEGES** on `johndoe_finio`.

### Step 2 — Import the schema

1. **Databases → phpMyAdmin**, click your database in the sidebar.
2. **Import** tab → **Choose File** → select `backend/schema.sql` → **Go**.
3. You should now have two tables:

```sql
users   — id, name, email, password_hash, is_verified, otp_hash, otp_expires,
          reset_token_hash, reset_token_expires, created_at
backups — id, user_id, backup_date, file_size, created_at
          (unique constraint: one backup per user per day)
```

### Step 3 — Create the API subdomain

1. cPanel → **Domains** (or **Subdomains**).
2. Create the subdomain `api`, giving you `api.yourdomain.com`.
3. Accept the default Document Root of `public_html/api`.
4. **Create**, then wait 5–10 minutes for DNS.

### Step 4 — Generate a JWT secret

In cPanel → **Advanced → Terminal**:

```bash
openssl rand -hex 32
```

Copy the 64-character output. This signs your tokens — keep it private.

### Step 5 — Create the email account

1. cPanel → **Email → Email Accounts**.
2. Create `noreply@yourdomain.com` with a strong password.
3. Note the SMTP settings: host `mail.yourdomain.com`, port `465` (SSL) or `587` (TLS) — try 465
   first, username `noreply@yourdomain.com`.

This address sends OTP verification and password-reset emails.

### Step 6 — Create the config file and backup folder

In cPanel Terminal:

```bash
mkdir -p ~/finio-backups && chmod 750 ~/finio-backups && mkdir -p ~/finio-config
```

The backup folder lives **outside** `public_html` so it is never web-accessible.

Then, in **File Manager**, create `~/finio-config/config.php` and paste in the entire contents of
`backend/config.example.php`. Replace every placeholder:

| Placeholder | Replace with |
|---|---|
| `CPANEL_USER_finio` | Your DB name (e.g. `johndoe_finio`) |
| `CPANEL_USER_finiouser` | Your DB user (e.g. `johndoe_finiouser`) |
| `YOUR_DB_PASSWORD` | The DB password from Step 1 |
| `CHANGE_THIS_TO_...` | The 64-char JWT secret from Step 4 |
| `mail.yourdomain.com` | Your mail host |
| `noreply@yourdomain.com` | Your noreply address from Step 5 |
| `YOUR_EMAIL_PASSWORD` | The email password from Step 5 |
| `CPANEL_USER` (in `backup_dir`) | Your cPanel username (e.g. `johndoe`) |
| `https://api.yourdomain.com` | Your API subdomain URL |

Then set `allowed_origins` to the frontends allowed to call the API — CORS is enforced against
this list:

```php
'allowed_origins' => [
    'https://finio.yourdomain.com',  // your frontend
    'http://localhost:5173',         // Vite dev server (remove in production)
],
```

### Step 7 — Upload the backend

**Via File Manager (recommended):**

```bash
cd /path/to/finio-web
zip -r backend.zip backend/ --exclude "backend/vendor/*"
```

Upload `backend.zip` to `public_html/api/`, extract it there, move everything from
`public_html/api/backend/` up into `public_html/api/`, then delete the empty folder and the zip.

The result should be:

```
public_html/api/
  public/
    .htaccess
    index.php
  src/
    Config.php  Database.php  Router.php  helpers.php
    controllers/  middleware/
  composer.json
  schema.sql
  config.example.php
```

**Via FTP:** host `ftp.yourdomain.com`, your cPanel credentials, upload the contents of `backend/`
straight into `public_html/api/`, skipping `vendor/`.

### Step 8 — Install Composer dependencies

Two packages: `firebase/php-jwt` and `phpmailer/phpmailer`.

```bash
cd ~/public_html/api
curl -sS https://getcomposer.org/installer | php
php composer.phar install --no-dev
ls vendor/   # expect: autoload.php  composer/  firebase/  phpmailer/
```

### Step 9 — Point the subdomain at `public/`

The entry point is `public/index.php`, one level below the default document root.

**Option A (recommended):** cPanel → **Subdomains** → edit `api.yourdomain.com` → change the
Document Root from `public_html/api` to `public_html/api/public` → **Change**.

**Option B (fallback):** create `public_html/api/.htaccess`:

```apache
RewriteEngine On
RewriteRule ^(.*)$ public/$1 [L]
```

### Step 10 — Test the API

```bash
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","password":"secret1234"}'
```

```bash
curl -X POST https://api.yourdomain.com/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","otp":"123456"}'
```

```bash
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"secret1234"}'
```

```bash
curl -X POST https://api.yourdomain.com/backup/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"accounts":[],"transactions":[],"categories":[],"labels":[],"budgets":[],"recurring":[],"settings":{}}'
```

```bash
curl https://api.yourdomain.com/backup/latest -H "Authorization: Bearer YOUR_TOKEN"
```

Expected, in order: the "check your email" message, then `{"token":"eyJ...","user":{...}}` twice,
then `{"message":"Backup saved"}`, then the payload you uploaded.

### Step 11 — Point the frontend at your API

Create `.env.local` in the project root:

```
VITE_API_URL=https://api.yourdomain.com
```

`VITE_*` variables are inlined at **build time**, so rebuild and redeploy:

```bash
npm run build
```

Deploy `dist/` to your web host (e.g. `public_html/` or `finio.yourdomain.com`). Make sure that
origin is in the backend's `allowed_origins`.

### API Reference

| Method + path | Auth | Purpose |
|---|---|---|
| `POST /auth/register` | — | Create account, email an OTP |
| `POST /auth/verify-otp` | — | → `{ token, user }` |
| `POST /auth/resend-otp` | — | Re-send the verification OTP |
| `POST /auth/login` | — | → `{ token, user }` |
| `POST /auth/forgot-password` | — | Email a reset OTP |
| `POST /auth/reset-password` | — | Set a new password with the OTP |
| `POST /backup/upload` | JWT | Store a backup (one per user per day) |
| `GET /backup/latest` | JWT | Most recent backup |
| `GET /backup/list` | JWT | Every backup's date and size |
| `GET /backup/{date}` | JWT | One specific backup |
| `DELETE /backup/{date}` | JWT | Delete one backup |
| `GET /user/me` | JWT | Profile |
| `PUT /user/me` | JWT | Change password → returns a fresh token |
| `DELETE /user/me` | JWT | Delete the account and all its backups |

The backup body is opaque to the server. With encryption enabled the client uploads an
`{v, enc, kdf, iterations, salt, iv, ciphertext}` envelope instead of the finance payload — no
backend change was needed, and older plaintext backups remain restorable.

---

## Contributing

[CLAUDE.md](CLAUDE.md) is the architecture guide — domain types, state management, the PWA setup,
and a long list of gotchas worth reading before you change anything money-related.
[IMPROVEMENTS.md](IMPROVEMENTS.md) records the backlog and how each item was resolved.

Before opening a PR: `npm test`, `npm run lint`, `npm run format`.
