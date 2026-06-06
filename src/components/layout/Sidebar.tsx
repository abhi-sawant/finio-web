import { useLocation, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navTabs } from './navItems';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="border-border bg-card/60 hidden w-60 shrink-0 flex-col gap-1 border-r px-3 py-5 backdrop-blur-xl lg:flex">
      {/* Brand */}
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <div className="bg-grad-primary shadow-glow-primary flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white">
          F
        </div>
        <span className="text-lg font-bold tracking-tight">Finio</span>
      </div>

      {/* Add transaction */}
      <button
        onClick={() => navigate('/add-transaction')}
        className="bg-grad-primary shadow-glow-primary mb-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
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
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-grad-primary-soft text-primary'
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
