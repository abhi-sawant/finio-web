import { useNavigate } from 'react-router';
import {
  ChevronRight,
  Tag,
  FolderOpen,
  Target,
  Repeat,
  PiggyBank,
  HandCoins,
  Landmark,
  Store,
  Wand2,
} from 'lucide-react';
import { CloudAccountSection } from '@/components/settings/CloudAccountSection';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AppLockSection } from '@/components/settings/AppLockSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { BackupSection } from '@/components/settings/BackupSection';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

export default function Settings() {
  const navigate = useNavigate();

  return (
    <>
      <Header innerClassName="lg:max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </Header>

      <Main className="lg:max-w-2xl">
        <CloudAccountSection />
        <BackupSection />
        <ProfileSection />
        <AppLockSection />
        <NotificationsSection />

        {/* Manage */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <button
            onClick={() => navigate('/budgets')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Target size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Budgets</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/recurring')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Repeat size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Recurring Transactions</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/goals')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <PiggyBank size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Savings Goals</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/debts')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <HandCoins size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Debts & Lending</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/loans')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Landmark size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Loans</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/merchants')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Store size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Merchants</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/manage-categories')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <FolderOpen size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Manage Categories</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/manage-labels')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Tag size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Manage Labels</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate('/category-rules')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Wand2 size={18} className="text-muted-foreground" />
              <div className="text-left">
                <p className="text-sm font-medium">Categorization Rules</p>
                <p className="text-muted-foreground text-xs">
                  File transactions automatically from their note
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-muted-foreground pt-2 text-center text-[11px]">
          Finio · Personal Finance
        </p>
      </Main>
    </>
  );
}
