import type { Category, Label, Settings } from '@/types';

export const defaultCategories: Category[] = [
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
  {
    id: 'cat-20',
    name: 'Financial Expenses',
    icon: 'dollar-sign',
    color: '#10b981',
    type: 'expense',
  },
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

export const defaultLabels: Label[] = [
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

export const defaultSettings: Settings = {
  currency: 'INR',
  theme: 'system',
  userName: 'Alex',
};
