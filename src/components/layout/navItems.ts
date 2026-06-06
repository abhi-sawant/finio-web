import { LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Settings } from 'lucide-react';

export const navTabs = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/accounts', icon: Wallet, label: 'Accounts' },
  { path: '/transactions', icon: ArrowLeftRight, label: 'Txns' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];
