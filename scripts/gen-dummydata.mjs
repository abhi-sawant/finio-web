// Generates dummydata.json: 6 accounts + 1000 logically-consistent transactions.
// Run: node scripts/gen-dummydata.mjs
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ── Deterministic PRNG (mulberry32) so reruns are reproducible ───────────
let _seed = 0x9e3779b9;
function rand() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const chance = (p) => rand() < p;

// ── Accounts (starting state) ────────────────────────────────────────────
const CUR = 'INR';
const accounts = [
  { id: 'acc-sav-1', name: 'Primary Savings', type: 'savings', currency: CUR, color: '#6C63FF', icon: 'piggy-bank', balance: 20000, createdAt: '2024-12-01T09:00:00.000Z' },
  { id: 'acc-sav-2', name: 'Emergency Fund', type: 'savings', currency: CUR, color: '#10b981', icon: 'piggy-bank', balance: 30000, createdAt: '2024-12-01T09:00:00.000Z' },
  { id: 'acc-sav-3', name: 'Goals Savings', type: 'savings', currency: CUR, color: '#f59e0b', icon: 'piggy-bank', balance: 40000, createdAt: '2024-12-01T09:00:00.000Z' },
  { id: 'acc-cash', name: 'Wallet Cash', type: 'cash', currency: CUR, color: '#22c55e', icon: 'wallet', balance: 10000, createdAt: '2024-12-01T09:00:00.000Z' },
  { id: 'acc-cc-1', name: 'Platinum Credit Card', type: 'credit', currency: CUR, color: '#ef4444', icon: 'credit-card', balance: 0, createdAt: '2024-12-01T09:00:00.000Z', creditLimit: 100000 },
  { id: 'acc-cc-2', name: 'Rewards Credit Card', type: 'credit', currency: CUR, color: '#8b5cf6', icon: 'credit-card', balance: 0, createdAt: '2024-12-01T09:00:00.000Z', creditLimit: 100000 },
];
const bal = Object.fromEntries(accounts.map((a) => [a.id, a.balance]));
const limit = Object.fromEntries(accounts.map((a) => [a.id, a.creditLimit ?? null]));
const isCredit = (id) => accounts.find((a) => a.id === id).type === 'credit';

const bankIds = ['acc-sav-1', 'acc-sav-2', 'acc-sav-3', 'acc-cash']; // non-credit, spendable
const creditIds = ['acc-cc-1', 'acc-cc-2'];

// ── Category pools (must match src/data/defaultData.ts) ───────────────────
const expenseCats = [
  { id: 'cat-1', amt: [100, 1500] },   // Food
  { id: 'cat-2', amt: [50, 900] },     // Transport
  { id: 'cat-3', amt: [300, 6000] },   // Shopping
  { id: 'cat-4', amt: [100, 2500] },   // Entertainment
  { id: 'cat-5', amt: [500, 3500] },   // Utilities
  { id: 'cat-6', amt: [200, 6000] },   // Healthcare
  { id: 'cat-7', amt: [1000, 15000] }, // Education
  { id: 'cat-8', amt: [5000, 25000] }, // Housing
  { id: 'cat-15', amt: [2000, 35000] },// Travel
  { id: 'cat-16', amt: [200, 3000] },  // Gifts
  { id: 'cat-17', amt: [100, 1800] },  // Personal Care
  { id: 'cat-18', amt: [99, 1200] },   // Subscriptions
  { id: 'cat-19', amt: [500, 9000] },  // Vehicles
  { id: 'cat-20', amt: [500, 6000] },  // Financial
  { id: 'cat-11', amt: [2000, 25000] },// Investments
  { id: 'cat-24', amt: [100, 2000] },  // Miscellaneous
];
const incomeCats = [
  { id: 'cat-10', amt: [5000, 30000] }, // Freelance
  { id: 'cat-12', amt: [8000, 40000] }, // Business
  { id: 'cat-21', amt: [500, 5000] },   // Gifts
  { id: 'cat-22', amt: [8000, 20000] }, // Rent
  { id: 'cat-23', amt: [200, 2000] },   // Interest
];
const labelIds = ['lbl-1', 'lbl-2', 'lbl-3', 'lbl-4', 'lbl-5', 'lbl-6', 'lbl-7', 'lbl-8', 'lbl-9'];

const expenseNotes = ['Groceries', 'Lunch out', 'Coffee', 'Fuel', 'Cab ride', 'Online order', 'Movie night', 'Electricity bill', 'Pharmacy', 'Course fee', 'Rent payment', 'Flight tickets', 'Birthday gift', 'Haircut', 'Streaming plan', 'Car service', 'Bank charges', 'Mutual fund SIP', 'Misc spend', 'Dinner', 'Bus pass', 'New shoes', 'Concert', 'Water bill', 'Doctor visit', 'Books', ''];
const incomeNotes = ['Project payment', 'Consulting fee', 'Side gig', 'Rent received', 'Savings interest', 'Cashback', 'Gift received', 'Bonus', ''];
const transferNotes = ['Moved to savings', 'Top up wallet', 'Credit card payment', 'Rebalance funds', 'Fund transfer', ''];

function randLabels() {
  if (chance(0.45)) return [];
  const n = randInt(1, 2);
  const out = new Set();
  while (out.size < n) out.add(pick(labelIds));
  return [...out];
}

// ── Date helpers — spread 1000 txns across ~17 months ending today ────────
const START = new Date('2025-01-05T00:00:00.000Z');
const END = new Date('2026-06-05T00:00:00.000Z');
const SPAN = END.getTime() - START.getTime();
const N = 1000;
function dateAt(i) {
  // monotonically increasing with small jitter, plus a random time of day
  const frac = (i + rand() * 0.8) / N;
  const t = START.getTime() + frac * SPAN;
  return new Date(Math.min(t, END.getTime()));
}

const txns = [];
let salaryMonthKey = '';

function addTxn(tx) {
  txns.push({ id: randomUUID(), createdAt: tx.date, labels: [], note: '', ...tx });
}

// Apply a candidate to balances if valid; return true on success.
function tryExpense(accId, amount, date) {
  if (isCredit(accId)) {
    if (bal[accId] - amount < -limit[accId]) return false; // would exceed credit limit
  } else if (bal[accId] - amount < 0) {
    return false; // would overdraw a bank/cash account
  }
  bal[accId] -= amount;
  return true;
}

for (let i = 0; i < N; i++) {
  const date = dateAt(i);
  const iso = date.toISOString();
  const monthKey = iso.slice(0, 7);

  // Guarantee a monthly salary into Primary Savings the first time we see a month.
  if (monthKey !== salaryMonthKey) {
    salaryMonthKey = monthKey;
    const salary = randInt(45000, 90000);
    bal['acc-sav-1'] += salary;
    addTxn({
      type: 'income', amount: salary, accountId: 'acc-sav-1', categoryId: 'cat-9',
      date: iso, note: 'Monthly salary', labels: ['lbl-3'],
    });
    i++; // counts toward the 1000
    if (i >= N) break;
  }

  const roll = rand();
  if (roll < 0.27) {
    // ── Income ──
    const c = pick(incomeCats);
    const amount = round2(randInt(c.amt[0], c.amt[1]));
    const accId = pick(bankIds);
    bal[accId] += amount;
    addTxn({ type: 'income', amount, accountId: accId, categoryId: c.id, date: iso, note: pick(incomeNotes), labels: randLabels() });
  } else if (roll < 0.85) {
    // ── Expense ── (try a few accounts/amounts before giving up)
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const c = pick(expenseCats);
      let amount = round2(randInt(c.amt[0], c.amt[1]));
      // ~38% of expenses go on a credit card, rest on bank/cash
      const accId = chance(0.38) ? pick(creditIds) : pick(bankIds);
      if (tryExpense(accId, amount, iso)) {
        addTxn({ type: 'expense', amount, accountId: accId, categoryId: c.id, date: iso, note: pick(expenseNotes), labels: randLabels() });
        placed = true;
      }
    }
    if (!placed) {
      // Fallback: a small affordable expense from the richest bank account.
      const accId = bankIds.reduce((a, b) => (bal[a] >= bal[b] ? a : b));
      const amount = round2(Math.max(50, Math.min(500, Math.floor(bal[accId] * 0.1))));
      if (tryExpense(accId, amount, iso)) {
        addTxn({ type: 'expense', amount, accountId: accId, categoryId: 'cat-24', date: iso, note: 'Misc spend', labels: [] });
      } else {
        // Bank fully drained — record a top-up income instead so we still hit N.
        const inc = randInt(3000, 12000);
        bal[accId] += inc;
        addTxn({ type: 'income', amount: inc, accountId: accId, categoryId: 'cat-12', date: iso, note: 'Income top-up', labels: [] });
      }
    }
  } else {
    // ── Transfer ──
    // 55%: pay down a credit card that has a due balance.
    const owingCards = creditIds.filter((id) => bal[id] < 0);
    if (owingCards.length && chance(0.55)) {
      const dest = pick(owingCards);
      const due = -bal[dest];
      const src = bankIds.reduce((a, b) => (bal[a] >= bal[b] ? a : b)); // richest bank
      const maxPay = Math.min(due, bal[src]);
      if (maxPay >= 100) {
        const amount = round2(maxPay <= 500 ? maxPay : randInt(Math.ceil(maxPay * 0.4), Math.floor(maxPay)));
        bal[src] -= amount;
        bal[dest] += amount;
        addTxn({ type: 'transfer', amount, accountId: src, toAccountId: dest, categoryId: 'cat-13', date: iso, note: 'Credit card payment', labels: ['lbl-5'] });
        continue;
      }
    }
    // Otherwise: bank → bank transfer.
    let placed = false;
    for (let attempt = 0; attempt < 6 && !placed; attempt++) {
      const src = pick(bankIds);
      let dest = pick(bankIds);
      if (dest === src) continue;
      if (bal[src] < 500) continue;
      const amount = round2(randInt(500, Math.max(500, Math.floor(bal[src] * 0.5))));
      if (amount <= bal[src]) {
        bal[src] -= amount;
        bal[dest] += amount;
        addTxn({ type: 'transfer', amount, accountId: src, toAccountId: dest, categoryId: 'cat-13', date: iso, note: pick(transferNotes), labels: randLabels() });
        placed = true;
      }
    }
    if (!placed) {
      // Fallback to a modest income so the count still advances.
      const accId = pick(bankIds);
      const amount = randInt(2000, 8000);
      bal[accId] += amount;
      addTxn({ type: 'income', amount, accountId: accId, categoryId: 'cat-23', date: iso, note: 'Interest credited', labels: [] });
    }
  }
}

// Trim/pad to exactly N (salary insertions can overshoot by a few).
txns.length = Math.min(txns.length, N);

// Sort newest-first to match the app's stored convention.
txns.sort((a, b) => new Date(b.date) - new Date(a.date));

// Write final (current) balances back onto the accounts.
for (const a of accounts) a.balance = round2(bal[a.id]);

const settings = { currency: CUR, theme: 'system', userName: 'Alex', autoLocalBackup: false };

// Re-import default categories & labels so the IDs referenced above resolve.
const categories = [
  { id: 'cat-1', name: 'Food', icon: 'utensils', color: '#ef4444', type: 'expense' },
  { id: 'cat-2', name: 'Transport', icon: 'car', color: '#f97316', type: 'expense' },
  { id: 'cat-3', name: 'Shopping', icon: 'shopping-bag', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-4', name: 'Entertainment', icon: 'film', color: '#ec4899', type: 'expense' },
  { id: 'cat-5', name: 'Utilities', icon: 'zap', color: '#06b6d4', type: 'expense' },
  { id: 'cat-6', name: 'Healthcare', icon: 'heart-pulse', color: '#10b981', type: 'expense' },
  { id: 'cat-7', name: 'Education', icon: 'book-open', color: '#3b82f6', type: 'expense' },
  { id: 'cat-8', name: 'Housing', icon: 'home', color: '#64748b', type: 'expense' },
  { id: 'cat-15', name: 'Travel', icon: 'plane', color: '#ef4444', type: 'expense' },
  { id: 'cat-16', name: 'Gifts', icon: 'gift', color: '#f97316', type: 'expense' },
  { id: 'cat-17', name: 'Personal Care', icon: 'scissors', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-18', name: 'Subscriptions', icon: 'repeat', color: '#ec4899', type: 'expense' },
  { id: 'cat-19', name: 'Vehicles', icon: 'truck', color: '#06b6d4', type: 'expense' },
  { id: 'cat-20', name: 'Financial', icon: 'dollar-sign', color: '#10b981', type: 'expense' },
  { id: 'cat-11', name: 'Investments', icon: 'trending-up', color: '#f59e0b', type: 'expense' },
  { id: 'cat-9', name: 'Salary', icon: 'briefcase', color: '#22c55e', type: 'income' },
  { id: 'cat-10', name: 'Freelance', icon: 'laptop', color: '#6C63FF', type: 'income' },
  { id: 'cat-12', name: 'Business', icon: 'building-2', color: '#a855f7', type: 'income' },
  { id: 'cat-21', name: 'Gifts', icon: 'gift', color: '#f97316', type: 'income' },
  { id: 'cat-22', name: 'Rent', icon: 'home', color: '#3b82f6', type: 'income' },
  { id: 'cat-23', name: 'Interest', icon: 'dollar-sign', color: '#10b981', type: 'income' },
  { id: 'cat-13', name: 'Transfer', icon: 'repeat', color: '#3b82f6', type: 'both' },
  { id: 'cat-24', name: 'Miscellaneous', icon: 'circle-ellipsis', color: '#94a3b8', type: 'both' },
];
const labels = [
  { id: 'lbl-1', name: 'Essential', color: '#22c55e' },
  { id: 'lbl-2', name: 'Discretionary', color: '#f59e0b' },
  { id: 'lbl-3', name: 'Recurring', color: '#3b82f6' },
  { id: 'lbl-4', name: 'Tax', color: '#ef4444' },
  { id: 'lbl-5', name: 'Obligation', color: '#10b981' },
  { id: 'lbl-6', name: 'Investment', color: '#8b5cf6' },
  { id: 'lbl-7', name: 'Lending', color: '#ec4899' },
  { id: 'lbl-8', name: 'For Self', color: '#64748b' },
  { id: 'lbl-9', name: 'For Others', color: '#06b6d4' },
];

const data = { accounts, transactions: txns, categories, labels, budgets: [], recurring: [], settings };
writeFileSync(new URL('../dummydata.json', import.meta.url), JSON.stringify(data, null, 2));

// ── Verification ──────────────────────────────────────────────────────────
const counts = txns.reduce((m, t) => ((m[t.type] = (m[t.type] || 0) + 1), m), {});
console.log('transactions:', txns.length, counts);
console.log('final balances:');
for (const a of accounts) {
  const due = a.type === 'credit' ? Math.abs(Math.min(a.balance, 0)) : null;
  console.log(`  ${a.name}: ${a.balance}${due !== null ? ` (due ${due} / limit ${a.creditLimit})` : ''}`);
  if (a.type !== 'credit' && a.balance < 0) throw new Error(`NEGATIVE balance: ${a.name}`);
  if (a.type === 'credit' && due > a.creditLimit) throw new Error(`OVER LIMIT: ${a.name}`);
}

// Independent replay from initial balances to confirm consistency.
const init = { 'acc-sav-1': 20000, 'acc-sav-2': 30000, 'acc-sav-3': 40000, 'acc-cash': 10000, 'acc-cc-1': 0, 'acc-cc-2': 0 };
const replay = { ...init };
for (const t of [...txns].sort((a, b) => new Date(a.date) - new Date(b.date))) {
  if (t.type === 'income') replay[t.accountId] += t.amount;
  else if (t.type === 'expense') replay[t.accountId] -= t.amount;
  else { replay[t.accountId] -= t.amount; replay[t.toAccountId] += t.amount; }
}
for (const a of accounts) {
  if (round2(replay[a.id]) !== a.balance) throw new Error(`replay mismatch ${a.name}: ${replay[a.id]} vs ${a.balance}`);
}
console.log('✓ replay matches stored balances; no negative banks; no card over limit');
