import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Settings, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { autoBackupIfNeeded, autoLocalBackupIfNeeded } from '@/services/backup';

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

  // Trigger a local auto-backup download (once per day) for non-logged-in users.
  useEffect(() => {
    if (!isHydrated || !isAuthLoaded) return;
    autoLocalBackupIfNeeded();
  }, [isHydrated, isAuthLoaded]);

  return (
    <>
      <Outlet />
      {/* FAB */}
      <button
        onClick={() => navigate('/add-transaction')}
        className="bg-grad-primary shadow-glow-primary fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        aria-label="Add transaction"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* Bottom Nav */}
      <nav
        className="pb-safe border-border bg-card/85 fixed right-0 left-0 z-40 flex w-full items-center justify-around border-t px-2 pt-2 backdrop-blur-xl"
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
                'relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isActive && (
                <span className="bg-grad-primary absolute -top-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
