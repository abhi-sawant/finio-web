import { DEFAULT_MONTH_START_DAY } from '@/utils/period';
import type { Category, Label, Settings } from '@/types';

/** Catch-all category that orphaned rows fall back to when their category is deleted. */
export const MISC_CATEGORY_ID = 'cat-24';

export const defaultCategories: Category[] = [
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
  {
    id: 'cat-20',
    name: 'Financial',
    icon: 'dollar-sign',
    color: '#10b981',
    type: 'expense',
  },
  { id: 'cat-11', name: 'Investments', icon: 'trending-up', color: '#f59e0b', type: 'expense' },
  { id: 'cat-9', name: 'Salary', icon: 'briefcase', color: '#22c55e', type: 'income' },
  { id: 'cat-10', name: 'Freelance', icon: 'laptop', color: '#6C63FF', type: 'income' },
  { id: 'cat-12', name: 'Business', icon: 'building-2', color: '#a855f7', type: 'income' },
  { id: 'cat-21', name: 'Gifts', icon: 'gift', color: '#f97316', type: 'income' },
  { id: 'cat-22', name: 'Rent', icon: 'home', color: '#3b82f6', type: 'income' },
  { id: 'cat-23', name: 'Interest', icon: 'dollar-sign', color: '#10b981', type: 'income' },
  { id: 'cat-13', name: 'Transfer', icon: 'repeat', color: '#3b82f6', type: 'both' },
  { id: 'cat-24', name: 'Miscellaneous', icon: 'circle-ellipsis', color: '#94a3b8', type: 'both' },
  { id: 'cat-25', name: 'Groceries', icon: 'shopping-cart', color: '#22c55e', type: 'expense' },
  { id: 'cat-26', name: 'Insurance', icon: 'umbrella', color: '#0ea5e9', type: 'expense' },
  { id: 'cat-27', name: 'Loan / EMI', icon: 'banknote', color: '#f43f5e', type: 'expense' },
  { id: 'cat-28', name: 'Rent', icon: 'building-2', color: '#78716c', type: 'expense' },
  { id: 'cat-29', name: 'Fitness & Wellness', icon: 'dumbbell', color: '#14b8a6', type: 'expense' },
  { id: 'cat-30', name: 'Pets', icon: 'paw-print', color: '#f59e0b', type: 'expense' },
  { id: 'cat-31', name: 'Childcare', icon: 'baby', color: '#fb923c', type: 'expense' },
  { id: 'cat-32', name: 'Home Maintenance', icon: 'wrench', color: '#6b7280', type: 'expense' },
  { id: 'cat-33', name: 'Bonus', icon: 'sparkles', color: '#fbbf24', type: 'income' },
  { id: 'cat-34', name: 'Dividends', icon: 'piggy-bank', color: '#10b981', type: 'income' },
];

/** Ids added after the original v1 category set — appended to existing installs by migration
 * rather than shipped only to fresh ones. */
export const NEW_DEFAULT_CATEGORY_IDS = [
  'cat-25',
  'cat-26',
  'cat-27',
  'cat-28',
  'cat-29',
  'cat-30',
  'cat-31',
  'cat-32',
  'cat-33',
  'cat-34',
];

export const defaultLabels: Label[] = [
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

export const defaultSettings: Settings = {
  theme: 'system',
  // Deliberately blank: the first-run wizard asks for a name rather than greeting a stranger
  // by a placeholder one.
  userName: '',
  autoLocalBackup: false,
  monthStartDay: DEFAULT_MONTH_START_DAY,
  hideAmounts: false,
  // Master off, sub-toggles on: nobody is opted into notifications without a tap, but the one
  // tap that turns them on immediately does something useful.
  notificationsEnabled: false,
  notifyBills: true,
  notifyBudgets: true,
  notifyCreditDue: true,
  notifyLeadDays: 2,
};
