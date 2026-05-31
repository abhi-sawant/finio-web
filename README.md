# Finio — Personal Finance Tracker

Finio is a privacy-first personal finance PWA (Progressive Web App) built with React, TypeScript, and Vite. It runs entirely in the browser with all data stored locally on your device.

**The app is live at [finio.slowatcoding.com](https://finio.slowatcoding.com)** — you can use it right now with a fully functional cloud backup backend included. No setup required.

If you prefer to keep your backup data on infrastructure you control, you can self-host the PHP backend yourself. See [Self-Hosting the Backend](#self-hosting-the-backend) for a complete guide.

---

## Table of Contents

- [About the PWA](#about-the-pwa)
- [Features](#features)
  - [Dashboard](#dashboard)
  - [Accounts](#accounts)
  - [Transactions](#transactions)
  - [Analytics](#analytics)
  - [Budgets](#budgets)
  - [Recurring Transactions](#recurring-transactions)
  - [Categories & Labels](#categories--labels)
  - [Cloud Backup](#cloud-backup)
  - [Settings](#settings)
- [How to Use](#how-to-use)
- [PWA Installation](#pwa-installation)
- [Frontend Development Setup](#frontend-development-setup)
- [Self-Hosting the Backend](#self-hosting-the-backend)
  - [Prerequisites](#prerequisites)
  - [Step 1 — Create the MySQL database](#step-1--create-the-mysql-database)
  - [Step 2 — Import the database schema](#step-2--import-the-database-schema)
  - [Step 3 — Create a subdomain for the API](#step-3--create-a-subdomain-for-the-api)
  - [Step 4 — Generate a JWT secret](#step-4--generate-a-jwt-secret)
  - [Step 5 — Create the email account](#step-5--create-the-email-account)
  - [Step 6 — Create the config file and backup folder](#step-6--create-the-config-file-and-backup-folder)
  - [Step 7 — Upload the backend files](#step-7--upload-the-backend-files)
  - [Step 8 — Install Composer dependencies](#step-8--install-composer-dependencies)
  - [Step 9 — Point the subdomain to the public/ folder](#step-9--point-the-subdomain-to-the-public-folder)
  - [Step 10 — Test the API](#step-10--test-the-api)
  - [Step 11 — Point the frontend at your API](#step-11--point-the-frontend-at-your-api)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

---

## About the PWA

Finio is a mobile-first personal finance tracker that works completely offline. Your financial data never leaves your device unless you explicitly choose to enable cloud backup. The app is installable on Android, iOS, and desktop as a standalone PWA — it looks and feels like a native app with no browser chrome.

**Key characteristics:**

- **Offline-first** — all data is persisted in `localStorage` via Zustand; no internet connection required to use the app.
- **Installable** — add to your home screen on iOS/Android or install on desktop via the browser's install prompt.
- **Privacy-first** — zero analytics, zero telemetry; your data is yours.
- **Optional cloud backup** — create a free account on the live hosted backend at [finio.slowatcoding.com](https://finio.slowatcoding.com) to get daily auto-backups that you can restore on any device. Self-hosting is also supported for maximum privacy.
- **Multi-currency** — supports INR, USD, EUR, GBP, JPY, CAD, and AUD with proper currency formatting.
- **Themeable** — light, dark, and system-follow themes.

---

## Features

### Dashboard

The dashboard is the home screen of Finio. It greets you by name with a time-aware greeting (Good morning / afternoon / evening) and gives you a snapshot of your financial health at a glance:

- **Hero balance card** — total balance across all non-credit accounts with an ambient gradient glow.
- **Net worth** — balance after subtracting credit card debt.
- **This month's income & expenses** — with a percentage change badge compared to last month (green for improvement, red for decline).
- **Account cards** — a horizontal scrollable row of all your accounts; tap any card to edit it.
- **Budget progress** — if you have set an overall budget, a progress ring shows how much of it you've used this month.
- **Top spending categories this month** — the three categories you've spent the most on.
- **Recent transactions** — the five most recent transactions with category icon, note, and amount; tap any to edit.
- **Quick-action shortcuts** — direct links to Budgets, Recurring, Analytics, and Accounts from the dashboard.

---

### Accounts

Manage all your financial accounts in one place.

**Supported account types:**

| Type | Description |
|---|---|
| Checking | Standard bank current account |
| Savings | Bank savings account |
| Cash | Physical cash wallet |
| Credit | Credit card (tracks outstanding balance vs. credit limit) |
| Investment | Stocks, mutual funds, crypto portfolio |
| Wallet | Digital wallets (UPI, PayPal, etc.) |

**Features:**

- Add accounts with a custom name, icon, color, starting balance, and currency.
- Credit accounts additionally accept a **credit limit** so you can track how much of your limit you've used.
- The Accounts page shows the **net balance** (sum of all non-credit accounts) and the **total credit due** (sum of outstanding balances on credit cards).
- Tap any account card to edit it; swipe or press the delete button to remove it (all associated transactions are also removed).

---

### Transactions

The full transaction ledger with powerful search and filtering.

**Transaction types:**

- **Expense** — money going out of an account.
- **Income** — money coming into an account.
- **Transfer** — money moved between two of your own accounts (no net change in net worth).

**Adding a transaction:**

1. Tap the **+** floating action button on the Dashboard or navigate to the Transactions tab and tap **+**.
2. Select the type (Expense / Income / Transfer).
3. Enter the amount.
4. Choose the source account (and destination account for transfers).
5. Pick a category (filtered to show only relevant types).
6. Set the date and time (defaults to now).
7. Add an optional note.
8. Attach one or more labels for further classification.
9. Tap **Save**.

**Transaction list features:**

- All transactions are grouped by date and displayed in reverse-chronological order.
- The list is **virtualized** (via `@tanstack/react-virtual`) so it remains smooth even with thousands of entries.
- **Search** by note text or category name.
- **Filters** — filter by transaction type (expense/income/transfer), account, from date, and to date.
- A **summary bar** shows the total income and total expense of the currently filtered view.
- **CSV export** — tap the download icon to export the currently filtered transactions as a `.csv` file with columns for date, type, amount, account, category, labels, and note.
- Tap any transaction row to edit it; the edit screen also has a delete button.

---

### Analytics

Visual insights into your financial data with flexible date filtering.

**Date filters:**

- This Month
- Last 3 Months
- Last 6 Months
- This Year
- All Time
- Custom date range (date picker)

**Charts included:**

| Chart | What it shows |
|---|---|
| **Spending Donut** | Breakdown of expenses by category for the selected period |
| **Income vs Expense Bar** | Month-by-month grouped bar chart comparing income and expenses |
| **Balance Trend** | Line chart showing cumulative net balance over time |
| **Label Spending Bar** | Horizontal bar chart of total spending per label |

Each chart section also shows the total income, total expenses, and net (income − expenses) for the selected period.

The Analytics page also surfaces shortcuts to your **Budgets** and **Recurring** rules.

---

### Budgets

Set monthly spending limits and track your progress.

- Create an **overall budget** — a single monthly cap across all expense categories.
- Create **per-category budgets** — individual monthly limits for specific expense categories (e.g., ₹5,000 for Food, ₹2,000 for Entertainment).
- Each budget card shows a progress bar with the amount spent vs. the limit, color-coded:
  - Green — under 80% used.
  - Amber — 80–100% used.
  - Red — over budget.
- Budgets reset automatically each calendar month (they are evaluated against the current month's transactions only).
- You can have at most one overall budget and one budget per category.

---

### Recurring Transactions

Automate regular income or expense entries so you never forget them.

- Create rules for **daily**, **weekly**, **monthly**, or **yearly** transactions.
- Each rule stores the type (income/expense), amount, account, category, note, labels, frequency, and start date.
- When you open the app, Finio automatically checks all recurring rules and **generates any past-due transactions** — so even if you haven't opened the app for a week, all your weekly recurring entries are caught up automatically.
- When you create a new rule with a start date in the past, all missed occurrences are generated immediately.
- Rules are listed with their last run date and next due date.
- Delete a rule to stop future generation (previously generated transactions remain).

---

### Categories & Labels

**Categories** classify what a transaction is for:

- 24 built-in categories covering common expense and income types (Food, Transport, Shopping, Entertainment, Utilities, Healthcare, Education, Housing, Travel, Gifts, Personal Care, Subscriptions, Vehicles, Financial, Investments, Salary, Freelance, Business, Rent, Interest, Transfer, Miscellaneous).
- Create custom categories with any name, color, and icon (from the Lucide icon library).
- Set each category's type: **Expense**, **Income**, or **Both** (e.g., Gifts, Transfer).
- Edit or delete categories (built-in categories can also be modified).

**Labels** are optional tags you can attach to any transaction for cross-category classification:

- 9 built-in labels: Essential, Discretionary, Recurring, Tax, Obligation, Investment, Lending, For Self, For Others.
- Create custom labels with any name and color.
- A transaction can have multiple labels.
- Labels appear in the Label Spending Bar chart on the Analytics page.

---

### Cloud Backup

Finio works 100% offline by default. Cloud backup is **opt-in** and requires either creating an account on the hosted backend or self-hosting your own.

**How it works:**

- **Register** with a name, email, and password. An OTP is sent to your email to verify your account.
- **Log in** to link the app to your account.
- Once logged in, Finio automatically backs up your data **once per day** when you open the app (only if you have at least one account, transaction, budget, or recurring rule).
- You can also **manually back up** at any time from Settings → Back Up Now.
- To restore data (e.g., on a new device), log in and tap **Restore from Cloud** — this pulls the latest backup and merges it into the local store.
- Backups are stored as JSON files on the server, one file per user per day. Only the latest backup is exposed through the API.
- **Forgot password** — enter your email to receive a reset OTP; enter the OTP and your new password to regain access.

**Local import/export:**

Even without a cloud account, you can back up and restore your data locally:
- **Export** — downloads your entire data store as a `.json` file.
- **Import** — uploads a previously exported `.json` file to restore data.

---

### Settings

Accessible via the gear icon on the Dashboard.

| Setting | Options |
|---|---|
| **Display name** | Any text — shown in the dashboard greeting |
| **Currency** | INR ₹, USD $, EUR €, GBP £, JPY ¥, CAD $, AUD $ |
| **Theme** | System (follows OS), Light, Dark |

Additional actions available in Settings:

- **Manage Categories** — add, edit, delete categories.
- **Manage Labels** — add, edit, delete labels.
- **Budgets** — shortcut to the Budgets page.
- **Recurring** — shortcut to the Recurring Transactions page.
- **Back Up Now** / **Restore from Cloud** — cloud backup controls (visible when logged in).
- **Export Data** — download a full JSON backup to your device.
- **Import Data** — restore from a local JSON file.
- **Reset to Defaults** — clears all data and restores factory defaults (accounts, transactions, budgets, and recurring rules are deleted; categories and labels reset to defaults).
- **Sign In / Sign Out** — manage your cloud backup account.

---

## How to Use

1. **Open the app** and you land on the Dashboard.
2. **Add an account** — tap the accounts row or navigate to Accounts → tap **+** → fill in name, type, starting balance, and currency → Save.
3. **Add a transaction** — tap **+** on the Dashboard → choose Expense / Income / Transfer → fill in amount, account, category, date, note, labels → Save.
4. **Set budgets** — go to Settings → Budgets → tap **+** → choose "Overall" or a specific category → enter a monthly limit → Save.
5. **Set up recurring rules** — go to Settings → Recurring → tap **+** → fill in type, amount, account, category, frequency, and start date → Save. Past-due entries are generated immediately.
6. **View analytics** — go to Analytics → select a date range → explore the charts.
7. **Enable cloud backup** (optional) — go to Settings → Sign In → Register → verify your email via OTP → sign in. Your data will auto-back up daily.

---

## PWA Installation

**Android (Chrome/Edge):**
1. Open the app URL in Chrome or Edge.
2. Tap the three-dot menu → **Add to Home Screen** (or look for the install banner at the bottom of the screen).
3. Tap **Install**. The app will appear on your home screen like a native app.

**iOS (Safari):**
1. Open the app URL in Safari.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The app icon will appear on your home screen.

**Desktop (Chrome/Edge):**
1. Open the app URL.
2. Click the install icon (monitor with a down arrow) in the address bar, or go to the browser menu → **Install Finio**.
3. Click **Install**.

Once installed, Finio opens in standalone mode (no browser chrome) and works fully offline.

---

## Frontend Development Setup

**Requirements:** Node.js 18+ and npm.

```bash
# 1. Clone the repository
git clone https://github.com/abhi-sawant/finio-web.git
cd finio-web

# 2. Install dependencies
npm install

# 3. (Optional) Point to a custom backend
#    Copy and edit the environment variable
echo "VITE_API_URL=https://api.yourdomain.com" > .env.local

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

**Other scripts:**

```bash
npm run build        # Production build (outputs to dist/)
npm run preview      # Preview the production build locally
npm run lint         # Run ESLint
npm run format       # Format source files with Prettier
npm run format:check # Check formatting without writing
```

---

## Self-Hosting the Backend

> **This is entirely optional.** The live app at [finio.slowatcoding.com](https://finio.slowatcoding.com) already includes a working cloud backup backend — just create a free account and you're done. Self-hosting is only for users who want full control over where their backup data is stored.

The backend is a lightweight PHP application designed for **cPanel shared hosting** (e.g., MilesWeb, Hostinger, SiteGround). It provides JWT authentication, email OTP verification, and JSON backup storage. The steps below guide you through a complete setup with no prior PHP or server experience required.

**Estimated time: ~45 minutes**

### Prerequisites

- A cPanel hosting account with:
  - PHP 8.0 or higher
  - MySQL database support
  - Composer (or Terminal access to install it)
  - An email account on your domain (for sending OTPs)
- A domain or subdomain to host the API (e.g., `api.yourdomain.com`)

---

### Step 1 — Create the MySQL database

1. Log in to your cPanel (usually `https://yourdomain.com:2083`).
2. Navigate to **Databases → MySQL® Databases**.
3. Create a new database named `finio`. cPanel will prefix it with your username (e.g., `johndoe_finio`). Note this full name.
4. Under **MySQL Users**, create a new user named `finiouser` with a strong password. The full username will be `johndoe_finiouser`. Save the password.
5. Under **Add User to Database**, add `johndoe_finiouser` to `johndoe_finio` with **ALL PRIVILEGES**.

---

### Step 2 — Import the database schema

1. In cPanel, go to **Databases → phpMyAdmin**.
2. In the left sidebar, click your database (`johndoe_finio`).
3. Click the **Import** tab.
4. Click **Choose File** and select `backend/schema.sql` from this project.
5. Click **Go**. You should see two new tables: `users` and `backups`.

The schema creates the following tables:

```sql
users   — id, name, email, password_hash, is_verified, otp_hash, otp_expires,
           reset_token_hash, reset_token_expires, created_at
backups — id, user_id, backup_date, file_size, created_at
          (unique constraint: one backup per user per day)
```

---

### Step 3 — Create a subdomain for the API

1. In cPanel, go to **Domains** (or **Subdomains**).
2. Create a new subdomain: `api`. This gives you `api.yourdomain.com`.
3. Set the **Document Root** to `public_html/api` (the default — accept it).
4. Click **Create** and wait 5–10 minutes for DNS to propagate.

---

### Step 4 — Generate a JWT secret

1. In cPanel, go to **Advanced → Terminal**.
2. Run:
   ```bash
   openssl rand -hex 32
   ```
3. Copy the 64-character output. This is your JWT signing secret. **Keep it private.**

---

### Step 5 — Create the email account

1. In cPanel, go to **Email → Email Accounts**.
2. Create a new account: `noreply@yourdomain.com` with a strong password.
3. Note the SMTP settings:
   - **Host:** `mail.yourdomain.com`
   - **Port:** `465` (SSL) or `587` (TLS) — try 465 first
   - **Username:** `noreply@yourdomain.com`

This address will send OTP verification and password-reset emails to your users.

---

### Step 6 — Create the config file and backup folder

1. In cPanel Terminal, run:
   ```bash
   mkdir -p ~/finio-backups
   chmod 750 ~/finio-backups
   mkdir -p ~/finio-config
   ```
   The backup folder lives **outside** `public_html` so it is not web-accessible.

2. Open **File Manager** in cPanel and navigate to your home directory.

3. Go into `finio-config/` and create a new file named `config.php`.

4. Open `backend/config.example.php` from this project, copy its entire contents, and paste them into the new `config.php`.

5. Replace every placeholder value:

   | Placeholder | Replace with |
   |---|---|
   | `CPANEL_USER_finio` | Your actual DB name (e.g. `johndoe_finio`) |
   | `CPANEL_USER_finiouser` | Your actual DB user (e.g. `johndoe_finiouser`) |
   | `YOUR_DB_PASSWORD` | The DB password from Step 1 |
   | `CHANGE_THIS_TO_...` | The 64-char JWT secret from Step 4 |
   | `mail.yourdomain.com` | Your actual mail host |
   | `noreply@yourdomain.com` | Your noreply email from Step 5 |
   | `YOUR_EMAIL_PASSWORD` | The email password from Step 5 |
   | `CPANEL_USER` (in backup_dir) | Your cPanel username (e.g. `johndoe`) |
   | `https://api.yourdomain.com` | Your actual API subdomain URL |

6. Update `allowed_origins` to include your frontend URL:
   ```php
   'allowed_origins' => [
       'https://finio.yourdomain.com',  // your frontend
       'http://localhost:5173',          // Vite dev server (remove in production)
   ],
   ```

7. Save the file.

---

### Step 7 — Upload the backend files

**Using cPanel File Manager (recommended):**

1. On your machine, create a zip of the backend (excluding any existing `vendor/` directory):
   ```bash
   cd /path/to/finio-web
   zip -r backend.zip backend/ --exclude "backend/vendor/*"
   ```
2. In File Manager, navigate to `public_html/api/`.
3. Click **Upload** and upload `backend.zip`.
4. Right-click `backend.zip` → **Extract** → extract to `/public_html/api/`.
5. Go into `public_html/api/backend/`, select all files, click **Move**, and move them to `/public_html/api/`.
6. Delete the now-empty `backend/` folder and `backend.zip`.

Your final structure inside `public_html/api/` should be:
```
public_html/api/
  public/
    .htaccess
    index.php
  src/
    Config.php
    Database.php
    Router.php
    helpers.php
    controllers/
    middleware/
  composer.json
  schema.sql
  config.example.php
```

**Using FTP (FileZilla or similar):**
- Host: `ftp.yourdomain.com`
- Credentials: your cPanel username and password
- Upload everything in `backend/` directly to `public_html/api/`
- Skip the `vendor/` folder if it exists (installed in the next step)

---

### Step 8 — Install Composer dependencies

The backend requires two packages: `firebase/php-jwt` (JWT signing) and `phpmailer/phpmailer` (email).

1. In cPanel Terminal:
   ```bash
   cd ~/public_html/api
   curl -sS https://getcomposer.org/installer | php
   php composer.phar install --no-dev
   ```
2. Verify the install:
   ```bash
   ls vendor/
   # Expected: autoload.php  composer/  firebase/  phpmailer/
   ```

---

### Step 9 — Point the subdomain to the public/ folder

The API's entry point is `public/index.php`, but by default the subdomain points to `public_html/api/`. You need to redirect it one level deeper.

**Option A — Change the document root (recommended):**

1. In cPanel → **Subdomains** (or **Domains**).
2. Find `api.yourdomain.com` and click **Edit**.
3. Change the Document Root from `public_html/api` to `public_html/api/public`.
4. Click **Change**.

**Option B — Add a redirect `.htaccess` (fallback):**

Create `public_html/api/.htaccess` with:
```apache
RewriteEngine On
RewriteRule ^(.*)$ public/$1 [L]
```

---

### Step 10 — Test the API

Replace `api.yourdomain.com` with your actual subdomain in the commands below.

```bash
# Test 1: Register a new user
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","password":"secret1234"}'
# Expected: {"message":"Account created. Please check your email to verify your account."}

# Test 2: Verify OTP (check your email for the 6-digit code)
curl -X POST https://api.yourdomain.com/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","otp":"123456"}'
# Expected: {"token":"eyJ...","user":{"id":1,"name":"John","email":"john@example.com"}}

# Test 3: Log in
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"secret1234"}'
# Expected: {"token":"eyJ...","user":{...}}

# Test 4: Upload a backup (replace YOUR_TOKEN)
curl -X POST https://api.yourdomain.com/backup/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"accounts":[],"transactions":[],"categories":[],"labels":[],"budgets":[],"recurring":[],"settings":{}}'
# Expected: {"message":"Backup saved"}

# Test 5: Retrieve the latest backup
curl https://api.yourdomain.com/backup/latest \
  -H "Authorization: Bearer YOUR_TOKEN"
# Expected: the JSON object you uploaded in Test 4
```

---

### Step 11 — Point the frontend at your API

In your local project (or in your hosting's environment variables), set:

```bash
VITE_API_URL=https://api.yourdomain.com
```

Create a `.env.local` file in the project root:

```
VITE_API_URL=https://api.yourdomain.com
```

Then rebuild and redeploy the frontend:

```bash
npm run build
```

Deploy the contents of the `dist/` folder to your web host (e.g., `public_html/` or a subdomain like `finio.yourdomain.com`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui + Base UI |
| State management | Zustand 5 (with `localStorage` persistence) |
| Routing | React Router 7 |
| Charts | Recharts 3 |
| Date handling | date-fns 4 |
| Virtual scrolling | @tanstack/react-virtual |
| Icons | Lucide React |
| PWA | vite-plugin-pwa + Workbox |
| Backend | PHP 8 + Composer |
| Auth | firebase/php-jwt (JWT, 30-day access tokens) |
| Email | PHPMailer (SMTP via cPanel email) |
| Database | MySQL (cPanel shared hosting) |

---

## Project Structure

```
finio-web/
├── src/
│   ├── App.tsx                  # Route definitions and lazy loading
│   ├── main.tsx                 # App entry point
│   ├── index.css                # Global styles and Tailwind directives
│   ├── assets/                  # Static assets (app logo, etc.)
│   ├── components/
│   │   ├── layout/              # Bottom navigation layout wrapper
│   │   ├── accounts/            # AccountCard component
│   │   ├── categories/          # CategoryIcon component
│   │   ├── charts/              # Recharts chart components
│   │   ├── transactions/        # TransactionItem component
│   │   └── ui/                  # shadcn/ui primitive components
│   ├── data/
│   │   └── defaultData.ts       # Default categories, labels, and settings
│   ├── lib/
│   │   └── utils.ts             # Tailwind class merge utility
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Accounts.tsx / AddAccount.tsx
│   │   ├── Transactions.tsx / AddTransaction.tsx
│   │   ├── Analytics.tsx
│   │   ├── Budgets.tsx
│   │   ├── Recurring.tsx
│   │   ├── ManageCategories.tsx
│   │   ├── ManageLabels.tsx
│   │   ├── Settings.tsx
│   │   └── auth/                # Login, Register, VerifyOtp, ForgotPassword, ResetPassword
│   ├── services/
│   │   ├── api.ts               # Typed API client (all backend calls)
│   │   └── backup.ts            # Auto-backup and restore logic
│   ├── store/
│   │   ├── useFinanceStore.ts   # Main data store (accounts, transactions, etc.)
│   │   └── useAuthStore.ts      # Auth token and user session store
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── utils/
│       ├── calculations.ts      # Financial calculations and aggregations
│       └── formatters.ts        # Currency, date, and number formatters
├── backend/
│   ├── public/
│   │   ├── index.php            # Single entry point for all API requests
│   │   └── .htaccess            # URL rewriting rules
│   ├── src/
│   │   ├── Config.php           # Config loader (reads ~/finio-config/config.php)
│   │   ├── Database.php         # PDO database connection
│   │   ├── Router.php           # Lightweight URL router
│   │   ├── helpers.php          # Response and JWT helper functions
│   │   ├── controllers/
│   │   │   ├── AuthController.php    # register, verify-otp, login, forgot/reset password
│   │   │   ├── BackupController.php  # upload and retrieve backups
│   │   │   └── UserController.php    # user profile endpoints
│   │   └── middleware/
│   │       └── AuthMiddleware.php    # JWT bearer token validation
│   ├── composer.json            # PHP dependencies (firebase/php-jwt, phpmailer)
│   ├── schema.sql               # Database schema (run once in phpMyAdmin)
│   └── config.example.php       # Config template — copy to ~/finio-config/config.php
├── public/                      # PWA icons and static assets served by Vite
├── vite.config.ts               # Vite + PWA + Tailwind + chunk splitting config
├── tsconfig.json                # TypeScript project references
└── package.json                 # npm dependencies and scripts
```
```
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
