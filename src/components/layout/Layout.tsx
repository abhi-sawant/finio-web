import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useLongPress } from '@/hooks/useLongPress';
import { formatCurrency } from '@/utils/formatters';
import { autoBackupIfNeeded, autoLocalBackupIfNeeded } from '@/services/backup';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Sidebar } from './Sidebar';
import { navTabs } from './navItems';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const processRecurring = useFinanceStore((s) => s.processRecurring);
  const isAuthLoaded = useAuthStore((s) => s.isLoaded);
  const templates = useFinanceStore((s) => s.templates);
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);

  const fabRef = useRef<HTMLButtonElement>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const { firedRef: fabLongPressFiredRef, handlers: fabLongPressHandlers } = useLongPress(() =>
    setTemplatesOpen(true),
  );

  const handleFabClick = () => {
    if (fabLongPressFiredRef.current) {
      fabLongPressFiredRef.current = false;
      return;
    }
    navigate('/add-transaction');
  };

  const handleUseTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const newId = addTransaction({
      type: template.type,
      amount: template.amount,
      accountId: template.accountId,
      ...(template.toAccountId ? { toAccountId: template.toAccountId } : {}),
      categoryId: template.categoryId,
      date: new Date().toISOString(),
      note: template.note,
      labels: template.labels,
      ...(template.splits ? { splits: template.splits } : {}),
    });
    setTemplatesOpen(false);
    toast.success(`Added "${template.name}"`, {
      action: { label: 'Undo', onClick: () => deleteTransaction(newId) },
    });
  };

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
      {/* Desktop sidebar (lg+) */}
      <Sidebar />

      {/* Content column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>

      {/* FAB — mobile only. Long-press for one-tap add from a saved template. */}
      <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <button
          ref={fabRef}
          onClick={handleFabClick}
          {...fabLongPressHandlers}
          className="bg-grad-primary shadow-glow-primary fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-95 lg:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
          aria-label="Add transaction. Long-press for templates."
        >
          <Plus size={26} strokeWidth={2.4} />
        </button>
        <PopoverContent anchor={fabRef} side="top" align="end" className="w-64">
          <p className="text-muted-foreground px-1 pb-1 text-xs font-medium tracking-wide uppercase">
            Templates
          </p>
          {templates.length === 0 ? (
            <p className="text-muted-foreground px-1 py-2 text-xs">
              No saved templates yet. Long-press a transaction and choose "Save as template".
            </p>
          ) : (
            <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleUseTemplate(t.id)}
                  className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                >
                  <Repeat size={13} className="text-muted-foreground shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatCurrency(t.amount, true, hideAmounts)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Bottom Nav — mobile only */}
      <nav
        className="pb-safe border-border bg-card/85 fixed right-0 left-0 z-40 flex w-full items-center justify-around border-t px-2 pt-2 backdrop-blur-xl lg:hidden"
        style={{ bottom: 0 }}
      >
        {navTabs.map((tab) => {
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
