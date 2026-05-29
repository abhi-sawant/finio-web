import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { autoBackupIfNeeded } from '@/services/backup';

const tabs = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/accounts', icon: Wallet, label: 'Accounts' },
  { path: '/transactions', icon: ArrowLeftRight, label: 'Txns' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const processRecurring = useFinanceStore((s) => s.processRecurring);
  const isAuthLoaded = useAuthStore((s) => s.isLoaded);

  // Process recurring rules once on hydration.
  useEffect(() => {
    if (!isHydrated) return;
    const generated = processRecurring();
    if (generated > 0) {
      toast.success(`Added ${generated} recurring transaction${generated === 1 ? '' : 's'}`);
    }
  }, [isHydrated, processRecurring]);

  // Trigger an auto cloud backup (24h cadence) once both stores are ready.
  useEffect(() => {
    if (!isHydrated || !isAuthLoaded) return;
    autoBackupIfNeeded().catch(() => {
      /* silent: handled by toast inside service */
    });
  }, [isHydrated, isAuthLoaded]);

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto relative">
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate('/add-transaction')}
        className="absolute right-4 z-50 w-14 h-14 rounded-full bg-grad-primary text-white shadow-glow-primary flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        aria-label="Add transaction"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* Bottom Nav */}
      <nav
        className="fixed left-0 right-0 max-w-md mx-auto z-40 px-2 pt-2 pb-safe border-t border-border bg-card/85 backdrop-blur-xl flex justify-around items-center"
        style={{ bottom: 0 }}
      >
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-grad-primary" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

