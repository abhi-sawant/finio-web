import { writeFileSync } from 'fs';

// Accounts
const accounts = [
  { id: 'acc-1', name: 'Main Checking', type: 'checking', currency: 'INR', color: '#3b82f6', icon: 'landmark', balance: 0, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'acc-2', name: 'Savings Account', type: 'savings', currency: 'INR', color: '#22c55e', icon: 'piggy-bank', balance: 0, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'acc-3', name: 'Cash Wallet', type: 'cash', currency: 'INR', color: '#f59e0b', icon: 'wallet', balance: 0, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'acc-4', name: 'Credit Card', type: 'credit', currency: 'INR', color: '#ef4444', icon: 'credit-card', balance: 0, createdAt: '2024-01-01T00:00:00.000Z', creditLimit: 200000 },
  { id: 'acc-5', name: 'Investment Portfolio', type: 'investment', currency: 'INR', color: '#8b5cf6', icon: 'trending-up', balance: 0, createdAt: '2024-01-01T00:00:00.000Z' },
];

// Running balances to enforce logical constraints
const runningBalance = { 'acc-1': 0, 'acc-2': 0, 'acc-3': 0, 'acc-4': 0, 'acc-5': 0 };
const CREDIT_LIMIT = 200000;

// Categories (same as default)
const categories = [
  { id: 'cat-1', name: 'Food & Dining', icon: 'utensils', color: '#ef4444', type: 'expense' },
  { id: 'cat-2', name: 'Transport', icon: 'car', color: '#f97316', type: 'expense' },
  { id: 'cat-3', name: 'Shopping', icon: 'shopping-bag', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-4', name: 'Entertainment', icon: 'film', color: '#ec4899', type: 'expense' },
  { id: 'cat-5', name: 'Utilities', icon: 'zap', color: '#06b6d4', type: 'expense' },
  { id: 'cat-6', name: 'Healthcare', icon: 'heart-pulse', color: '#10b981', type: 'expense' },
  { id: 'cat-7', name: 'Education', icon: 'book-open', color: '#3b82f6', type: 'expense' },
  { id: 'cat-8', name: 'Rent & Housing', icon: 'home', color: '#64748b', type: 'expense' },
  { id: 'cat-15', name: 'Travel', icon: 'plane', color: '#ef4444', type: 'expense' },
  { id: 'cat-16', name: 'Gifts & Donations', icon: 'gift', color: '#f97316', type: 'expense' },
  { id: 'cat-17', name: 'Personal Care', icon: 'scissors', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-18', name: 'Subscriptions', icon: 'repeat', color: '#ec4899', type: 'expense' },
  { id: 'cat-19', name: 'Vehicles', icon: 'truck', color: '#06b6d4', type: 'expense' },
  { id: 'cat-20', name: 'Financial Expenses', icon: 'dollar-sign', color: '#10b981', type: 'expense' },
  { id: 'cat-11', name: 'Investments', icon: 'trending-up', color: '#f59e0b', type: 'expense' },
  { id: 'cat-9', name: 'Salary', icon: 'briefcase', color: '#22c55e', type: 'income' },
  { id: 'cat-10', name: 'Freelance', icon: 'laptop', color: '#6C63FF', type: 'income' },
  { id: 'cat-12', name: 'Business', icon: 'building-2', color: '#a855f7', type: 'income' },
  { id: 'cat-21', name: 'Gifts (Income)', icon: 'gift', color: '#f97316', type: 'income' },
  { id: 'cat-22', name: 'Rental Income', icon: 'home', color: '#3b82f6', type: 'income' },
  { id: 'cat-23', name: 'Interest Income', icon: 'dollar-sign', color: '#10b981', type: 'income' },
  { id: 'cat-13', name: 'Transfer', icon: 'repeat', color: '#3b82f6', type: 'both' },
  { id: 'cat-14', name: 'Other', icon: 'circle-ellipsis', color: '#94a3b8', type: 'both' },
  { id: 'cat-24', name: 'Miscellaneous', icon: 'circle-ellipsis', color: '#94a3b8', type: 'both' },
];

// Labels (same as default)
const labels = [
  { id: 'lbl-1', name: 'Essential', color: '#22c55e' },
  { id: 'lbl-2', name: 'Discretionary', color: '#f59e0b' },
  { id: 'lbl-3', name: 'Recurring', color: '#3b82f6' },
  { id: 'lbl-4', name: 'Tax', color: '#ef4444' },
  { id: 'lbl-5', name: 'Financial Obligation', color: '#10b981' },
  { id: 'lbl-6', name: 'Investment', color: '#8b5cf6' },
  { id: 'lbl-7', name: 'Lending', color: '#ec4899' },
  { id: 'lbl-8', name: 'My Expense', color: '#64748b' },
  { id: 'lbl-9', name: "Other's Expense", color: '#06b6d4' },
];

const settings = { currency: 'INR', theme: 'system', userName: 'Alex' };

// Expense categories and their typical amounts (INR)
const expenseCategories = [
  { id: 'cat-1', minAmt: 100, maxAmt: 3000, notes: ['Lunch at office', 'Dinner out', 'Groceries', 'Zomato order', 'Swiggy delivery', 'Coffee shop', 'Street food', 'Restaurant bill', 'Breakfast', 'Snacks'] },
  { id: 'cat-2', minAmt: 50, maxAmt: 2500, notes: ['Uber ride', 'Metro card recharge', 'Auto rickshaw', 'Ola cab', 'Petrol', 'Bus ticket', 'Rapido bike', 'Parking charges', 'Toll fee', 'Train ticket'] },
  { id: 'cat-3', minAmt: 200, maxAmt: 15000, notes: ['Amazon order', 'Flipkart purchase', 'Clothes shopping', 'Electronics', 'Home decor', 'Kitchen items', 'Books', 'Shoes', 'Accessories', 'Gift shopping'] },
  { id: 'cat-4', minAmt: 100, maxAmt: 5000, notes: ['Movie tickets', 'Netflix subscription', 'Spotify premium', 'Concert tickets', 'Gaming purchase', 'YouTube Premium', 'Book purchase', 'Bowling night', 'Amusement park', 'Streaming service'] },
  { id: 'cat-5', minAmt: 500, maxAmt: 8000, notes: ['Electricity bill', 'Water bill', 'Internet bill', 'Gas bill', 'Phone recharge', 'DTH recharge', 'Maintenance charges', 'Broadband', 'Waste collection', 'Society charges'] },
  { id: 'cat-6', minAmt: 200, maxAmt: 10000, notes: ['Doctor consultation', 'Medicines', 'Lab tests', 'Dental checkup', 'Eye checkup', 'Gym membership', 'Health supplement', 'Physiotherapy', 'Vaccination', 'Insurance premium'] },
  { id: 'cat-7', minAmt: 500, maxAmt: 20000, notes: ['Online course', 'Books for study', 'Coaching fees', 'Exam fees', 'Stationery', 'Udemy course', 'Coursera subscription', 'Workshop fees', 'Certification', 'Tutorial classes'] },
  { id: 'cat-8', minAmt: 5000, maxAmt: 35000, notes: ['Monthly rent', 'Home repair', 'Plumber visit', 'Electrician', 'Painting work', 'Furniture', 'Cleaning service', 'Pest control', 'Lock repair', 'Appliance repair'] },
  { id: 'cat-15', minAmt: 2000, maxAmt: 50000, notes: ['Flight tickets', 'Hotel booking', 'Travel insurance', 'Visa fees', 'Tour package', 'Holiday trip', 'Weekend getaway', 'Train booking', 'Cab for travel', 'Travel essentials'] },
  { id: 'cat-16', minAmt: 500, maxAmt: 10000, notes: ['Birthday gift', 'Wedding gift', 'Charity donation', 'Festival gift', 'Anniversary gift', 'Housewarming gift', 'Baby shower gift', 'Temple donation', 'NGO contribution', 'Farewell gift'] },
  { id: 'cat-17', minAmt: 200, maxAmt: 5000, notes: ['Haircut', 'Salon visit', 'Skincare products', 'Perfume', 'Grooming kit', 'Spa treatment', 'Face wash', 'Shaving supplies', 'Beauty products', 'Makeup'] },
  { id: 'cat-18', minAmt: 100, maxAmt: 3000, notes: ['Newspaper subscription', 'Magazine subscription', 'Cloud storage', 'Software subscription', 'App subscription', 'Premium membership', 'Gym subscription', 'Music app', 'News app', 'VPN service'] },
  { id: 'cat-19', minAmt: 500, maxAmt: 15000, notes: ['Car service', 'Bike service', 'Tyre replacement', 'Car wash', 'Insurance renewal', 'Road tax', 'Spare parts', 'Oil change', 'Battery replacement', 'Brake repair'] },
  { id: 'cat-20', minAmt: 100, maxAmt: 5000, notes: ['Bank charges', 'ATM fees', 'Late payment fee', 'Credit card fee', 'Processing fee', 'Stamp duty', 'Brokerage', 'Interest payment', 'Penalty charges', 'Service tax'] },
];

const incomeCategories = [
  { id: 'cat-9', minAmt: 40000, maxAmt: 150000, notes: ['Monthly salary', 'Salary credited', 'Bonus', 'Incentive', 'Arrears'] },
  { id: 'cat-10', minAmt: 5000, maxAmt: 80000, notes: ['Freelance project', 'Consulting fee', 'Design work', 'Content writing', 'Web development', 'App development', 'Photography gig', 'Video editing'] },
  { id: 'cat-12', minAmt: 10000, maxAmt: 100000, notes: ['Business revenue', 'Client payment', 'Invoice payment', 'Partnership income', 'Commission'] },
  { id: 'cat-21', minAmt: 1000, maxAmt: 25000, notes: ['Birthday money', 'Festival gift', 'Wedding gift received', 'Cash gift', 'Reward'] },
  { id: 'cat-22', minAmt: 8000, maxAmt: 50000, notes: ['Monthly rent received', 'Lease payment', 'Property income', 'Subletting income'] },
  { id: 'cat-23', minAmt: 100, maxAmt: 10000, notes: ['Savings interest', 'FD interest', 'Dividend', 'Bond interest', 'RD maturity'] },
];

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper: check if account can afford an expense
function canAffordExpense(accountId, amount) {
  if (accountId === 'acc-4') {
    // Credit card: keep usage under 70% of limit for realism
    return (runningBalance[accountId] - amount) >= -(CREDIT_LIMIT * 0.7);
  }
  // All other accounts: balance must stay >= 0
  return runningBalance[accountId] >= amount;
}

// Helper: find a valid expense account for given amount
function findExpenseAccount(amount) {
  // Prefer: checking (50%), credit card (30%), cash (20%)
  const preferences = [
    { id: 'acc-1', weight: 0.5 },
    { id: 'acc-4', weight: 0.3 },
    { id: 'acc-3', weight: 0.2 },
  ];
  // Shuffle based on weight
  const roll = Math.random();
  let ordered;
  if (roll < 0.5) ordered = ['acc-1', 'acc-4', 'acc-3'];
  else if (roll < 0.8) ordered = ['acc-4', 'acc-1', 'acc-3'];
  else ordered = ['acc-3', 'acc-1', 'acc-4'];

  for (const id of ordered) {
    if (canAffordExpense(id, amount)) return id;
  }
  return null; // Can't afford from any account
}

// Generate dates chronologically — one every ~17 hours across 2 years
const startDate = new Date('2024-06-01');
const endDate = new Date('2026-05-25');
const totalMs = endDate.getTime() - startDate.getTime();

// Pre-generate sorted dates for 1000 transactions
const dates = [];
for (let i = 0; i < 1000; i++) {
  dates.push(new Date(startDate.getTime() + Math.random() * totalMs));
}
dates.sort((a, b) => a.getTime() - b.getTime());

// Generate transactions chronologically, respecting balance constraints
const transactions = [];

// We need income early to build balances. Use a scheduling approach:
// Every month: 1-2 salary, some freelance/business income, then expenses
// We'll iterate chronologically and ensure income comes first per period

// Pre-plan: generate all 1000 transaction intents, then assign in order
const txIntents = [];

for (let i = 0; i < 1000; i++) {
  const roll = Math.random();
  if (roll < 0.22) {
    txIntents.push('income');
  } else if (roll < 0.90) {
    txIntents.push('expense');
  } else {
    txIntents.push('transfer');
  }
}

// Reorder so income tends to come earlier within each month-chunk
// Group by month, then sort: income first, then transfers, then expenses
const monthChunks = new Map();
for (let i = 0; i < 1000; i++) {
  const monthKey = `${dates[i].getFullYear()}-${dates[i].getMonth()}`;
  if (!monthChunks.has(monthKey)) monthChunks.set(monthKey, []);
  monthChunks.get(monthKey).push(i);
}

const reorderedIndices = [];
for (const [, indices] of monthChunks) {
  const incomes = indices.filter(i => txIntents[i] === 'income');
  const transfers = indices.filter(i => txIntents[i] === 'transfer');
  const expenses = indices.filter(i => txIntents[i] === 'expense');
  reorderedIndices.push(...incomes, ...transfers, ...expenses);
}

// Now generate actual transactions in reordered order
for (const idx of reorderedIndices) {
  const intent = txIntents[idx];
  const date = dates[idx];
  const dateStr = date.toISOString().split('T')[0];
  const createdAt = date.toISOString();

  if (intent === 'income') {
    const cat = randomChoice(incomeCategories);
    const amount = randomInt(cat.minAmt, cat.maxAmt);
    const accountId = randomChoice(['acc-1', 'acc-1', 'acc-1', 'acc-2']); // mostly to checking
    const txLabels = Math.random() < 0.3 ? [randomChoice(labels).id] : [];

    runningBalance[accountId] += amount;

    transactions.push({
      id: generateUUID(),
      type: 'income',
      amount,
      accountId,
      categoryId: cat.id,
      date: dateStr,
      note: randomChoice(cat.notes),
      labels: txLabels,
      createdAt,
    });
  } else if (intent === 'transfer') {
    // Transfer from account with highest balance to another
    const sortedAccounts = ['acc-1', 'acc-2', 'acc-3'].sort((a, b) => runningBalance[b] - runningBalance[a]);
    const fromId = sortedAccounts[0];
    const amount = Math.min(randomInt(2000, 30000), Math.floor(runningBalance[fromId] * 0.3));

    if (amount >= 1000 && runningBalance[fromId] >= amount) {
      // Pick destination: transfer to savings, cash, or investment
      const possibleTo = ['acc-2', 'acc-3', 'acc-5'].filter(id => id !== fromId);
      const toId = randomChoice(possibleTo);

      runningBalance[fromId] -= amount;
      runningBalance[toId] += amount;

      transactions.push({
        id: generateUUID(),
        type: 'transfer',
        amount,
        accountId: fromId,
        toAccountId: toId,
        categoryId: 'cat-13',
        date: dateStr,
        note: randomChoice(['Transfer to savings', 'Monthly investment', 'Cash withdrawal', 'Move funds', 'Top up wallet', 'Emergency fund', 'SIP transfer', 'Rebalancing']),
        labels: [],
        createdAt,
      });
    } else {
      // Can't transfer, make it a small income instead
      const cat = randomChoice(incomeCategories);
      const fallbackAmount = randomInt(5000, 30000);
      runningBalance['acc-1'] += fallbackAmount;

      transactions.push({
        id: generateUUID(),
        type: 'income',
        amount: fallbackAmount,
        accountId: 'acc-1',
        categoryId: cat.id,
        date: dateStr,
        note: randomChoice(cat.notes),
        labels: [],
        createdAt,
      });
    }
  } else {
    // Expense
    const cat = randomChoice(expenseCategories);
    let amount = randomInt(cat.minAmt, cat.maxAmt);
    const accountId = findExpenseAccount(amount);

    if (accountId) {
      const txLabels = Math.random() < 0.4 ? [randomChoice(labels).id] : [];
      if (Math.random() < 0.15 && txLabels.length > 0) {
        const extra = randomChoice(labels.filter(l => !txLabels.includes(l.id)));
        if (extra) txLabels.push(extra.id);
      }

      runningBalance[accountId] -= amount;

      transactions.push({
        id: generateUUID(),
        type: 'expense',
        amount,
        accountId,
        categoryId: cat.id,
        date: dateStr,
        note: randomChoice(cat.notes),
        labels: [...new Set(txLabels)],
        createdAt,
      });
    } else {
      // Can't afford any expense — generate smaller expense or skip to income
      const smallAmount = randomInt(50, 500);
      const smallAccountId = findExpenseAccount(smallAmount);
      if (smallAccountId) {
        runningBalance[smallAccountId] -= smallAmount;
        transactions.push({
          id: generateUUID(),
          type: 'expense',
          amount: smallAmount,
          accountId: smallAccountId,
          categoryId: 'cat-1',
          date: dateStr,
          note: 'Small purchase',
          labels: [],
          createdAt,
        });
      } else {
        // Fallback: make it an income
        const fallbackAmount = randomInt(10000, 50000);
        runningBalance['acc-1'] += fallbackAmount;
        transactions.push({
          id: generateUUID(),
          type: 'income',
          amount: fallbackAmount,
          accountId: 'acc-1',
          categoryId: 'cat-10',
          date: dateStr,
          note: 'Freelance payment received',
          labels: [],
          createdAt,
        });
      }
    }
  }
}

// Also add periodic credit card payments (transfer from checking to pay off CC)
// This ensures the credit card balance gets paid down periodically
const ccPayments = [];
let sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

// Sort final transactions by date descending (newest first)
transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// Final balances from running totals
const finalAccounts = accounts.map(a => ({ ...a, balance: runningBalance[a.id] }));

const backup = {
  accounts: finalAccounts,
  transactions,
  categories,
  labels,
  settings,
};

writeFileSync('finio-backup-1000.json', JSON.stringify(backup, null, 2));
console.log(`Generated backup with ${transactions.length} transactions`);
console.log('Account balances:', finalAccounts.map(a => `${a.name}: ₹${a.balance.toLocaleString()}`).join(', '));
