import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronRight, User, Palette, Tag, FolderOpen, Download, Upload, RotateCcw,
  LogIn, LogOut, Cloud, CloudUpload, Target, Repeat,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { uploadBackup, restoreLatestBackup } from '@/services/backup';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Currency, Theme } from '@/types';

const currencies: { value: Currency; label: string }[] = [
  { value: 'INR', label: '₹ INR' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'GBP', label: '£ GBP' },
  { value: 'JPY', label: '¥ JPY' },
  { value: 'CAD', label: '$ CAD' },
  { value: 'AUD', label: '$ AUD' },
];

const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const navigate = useNavigate();
  const settings = useFinanceStore((s) => s.settings);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const resetToDefaults = useFinanceStore((s) => s.resetToDefaults);
  const importData = useFinanceStore((s) => s.importData);

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const lastBackupAt = useAuthStore((s) => s.lastBackupAt);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(settings.userName);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleExport = () => {
    try {
      const state = useFinanceStore.getState();
      const data = {
        accounts: state.accounts,
        transactions: state.transactions,
        categories: state.categories,
        labels: state.labels,
        budgets: state.budgets,
        recurring: state.recurring,
        settings: state.settings,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!parsed || typeof parsed !== 'object') throw new Error('Invalid');
          const hasAny =
            Array.isArray(parsed.accounts) ||
            Array.isArray(parsed.transactions) ||
            Array.isArray(parsed.categories) ||
            Array.isArray(parsed.labels) ||
            Array.isArray(parsed.budgets) ||
            Array.isArray(parsed.recurring) ||
            (parsed.settings && typeof parsed.settings === 'object');
          if (!hasAny) throw new Error('Empty');
          if (!confirm('Import will replace your current data. Continue?')) return;
          importData(parsed);
          toast.success('Data imported');
        } catch {
          toast.error('Invalid backup file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    if (confirm('Reset all data to defaults? This cannot be undone.')) {
      resetToDefaults();
      toast.success('Reset complete');
    }
  };

  const handleCloudBackup = async () => {
    setBackingUp(true);
    try {
      await uploadBackup();
      toast.success('Backup uploaded successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!confirm('Restore from cloud backup? This will replace your current data.')) return;
    setRestoring(true);
    try {
      await restoreLatestBackup();
      toast.success('Data restored from cloud backup');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleNameSave = async (newName: string) => {
    const trimmed = newName.trim() || 'User';
    updateSettings({ userName: trimmed });
    setEditingName(false);
    if (token) {
      try {
        const res = await api.updateProfile(token, { name: trimmed });
        setAuth(res.token, res.user);
      } catch {
        // local save succeeded; backend sync failed silently
      }
    }
  };

  const handleLogout = () => {
    if (confirm('Sign out of your account?')) {
      clearAuth();
      toast.success('Signed out');
    }
  };

  return (
    <div className="px-4 pb-6 safe-top">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Account */}
      <div className="card-elevated rounded-2xl divide-y divide-border overflow-hidden">
        {token && user ? (
          <>
            <div className="p-4 flex items-center gap-3 bg-grad-primary-soft">
              <div className="w-11 h-11 rounded-full bg-grad-primary flex items-center justify-center shadow-glow-primary">
                <User size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors">
              <LogOut size={18} className="text-destructive" />
              <span className="text-sm font-medium text-destructive">Sign Out</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="w-full p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-grad-primary flex items-center justify-center shadow-glow-primary">
                <LogIn size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Sign In</p>
                <p className="text-xs text-muted-foreground">Sync your data across devices</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Cloud Backup */}
      {token && (
        <div className="card-elevated rounded-2xl divide-y divide-border">
          <button
            onClick={handleCloudBackup}
            disabled={backingUp}
            className="w-full p-4 flex items-center gap-3 disabled:opacity-60"
          >
            <CloudUpload size={18} className="text-muted-foreground" />
            <div className="text-left flex-1">
              <span className="text-sm font-medium block">
                {backingUp ? 'Backing up...' : 'Backup to Cloud'}
              </span>
              {lastBackupAt && (
                <span className="text-xs text-muted-foreground">
                  Last: {new Date(lastBackupAt).toLocaleString()}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={handleCloudRestore}
            disabled={restoring}
            className="w-full p-4 flex items-center gap-3 disabled:opacity-60"
          >
            <Cloud size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">
              {restoring ? 'Restoring...' : 'Restore from Cloud'}
            </span>
          </button>
        </div>
      )}

      {/* Profile name */}
      <div className="card-elevated rounded-2xl divide-y divide-border">
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-grad-primary-soft flex items-center justify-center">
            <User size={18} className="text-primary" />
          </div>
          {editingName ? (
            <Input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => handleNameSave(nameValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave(nameValue);
              }}
              className="flex-1 h-auto bg-muted border-0 px-3 py-1.5 rounded-lg"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="flex-1 text-left">
              <p className="text-sm font-medium">{settings.userName}</p>
              <p className="text-xs text-muted-foreground">Tap to edit name</p>
            </button>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card-elevated rounded-2xl divide-y divide-border">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">💱</span>
            <span className="text-sm font-medium">Currency</span>
          </div>
          <Select
            value={settings.currency}
            onValueChange={(v) => updateSettings({ currency: v as Currency })}
          >
            <SelectTrigger className="h-auto bg-muted border-0 px-3 py-1.5 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Theme</span>
          </div>
          <Select
            value={settings.theme}
            onValueChange={(v) => updateSettings({ theme: v as Theme })}
          >
            <SelectTrigger className="h-auto bg-muted border-0 px-3 py-1.5 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Manage */}
      <div className="card-elevated rounded-2xl divide-y divide-border">
        <button
          onClick={() => navigate('/budgets')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Target size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Budgets</span>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/recurring')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Repeat size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Recurring Transactions</span>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/manage-categories')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <FolderOpen size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Manage Categories</span>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/manage-labels')}
          className="w-full p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Tag size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Manage Labels</span>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Data */}
      <div className="card-elevated rounded-2xl divide-y divide-border">
        <button onClick={handleExport} className="w-full p-4 flex items-center gap-3">
          <Download size={18} className="text-muted-foreground" />
          <span className="text-sm font-medium">Export Data (JSON)</span>
        </button>
        <button onClick={handleImport} className="w-full p-4 flex items-center gap-3">
          <Upload size={18} className="text-muted-foreground" />
          <span className="text-sm font-medium">Import Data</span>
        </button>
        <button onClick={handleReset} className="w-full p-4 flex items-center gap-3">
          <RotateCcw size={18} className="text-destructive" />
          <span className="text-sm font-medium text-destructive">Reset to Defaults</span>
        </button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground pt-2">Finio · Personal Finance</p>
    </div>
  );
}

