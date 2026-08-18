import { useLocation, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navTabs } from './navItems';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="border-border bg-card hidden w-60 shrink-0 flex-col gap-1 border-r px-3 py-5 lg:flex">
      {/* Brand */}
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <div className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-full text-base font-bold">
          F
        </div>
        <span className="font-heading text-lg font-bold tracking-tight">Finio</span>
      </div>

      {/* Add transaction */}
      <button
        onClick={() => navigate('/add-transaction')}
        className="bg-primary text-primary-foreground mb-3 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
      >
        <Plus size={18} strokeWidth={2.4} />
        Add Transaction
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navTabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              {tab.label === 'Txns' ? 'Transactions' : tab.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
