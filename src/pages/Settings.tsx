import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronRight,
  User,
  Palette,
  Tag,
  FolderOpen,
  Folder,
  Download,
  Upload,
  RotateCcw,
  LogIn,
  LogOut,
  Cloud,
  CloudUpload,
  Target,
  Repeat,
  HardDrive,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { uploadBackup, restoreLatestBackup, saveLocalBackup } from '@/services/backup';
import {
  chooseBackupFolder,
  clearBackupFolder,
  getSavedDirectoryHandle,
  isFolderPickerSupported,
} from '@/services/backupFolder';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Currency, Theme } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const currencySymbols: Record<Currency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: '$',
  AUD: '$',
};

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
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  const [showFolderSetupInfo, setShowFolderSetupInfo] = useState(false);

  useEffect(() => {
    if (!isFolderPickerSupported()) return;
    getSavedDirectoryHandle().then((handle) => setBackupFolderName(handle?.name ?? null));
  }, []);

  const handleExport = async () => {
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
      const filename = `finio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await saveLocalBackup(filename, JSON.stringify(data, null, 2), { allowPrompt: true });
      toast.success('Backup downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleChooseBackupFolder = async () => {
    setShowFolderSetupInfo(false);
    try {
      const handle = await chooseBackupFolder();
      setBackupFolderName(handle.name);
      toast.success(`Backups will be saved to "${handle.name}"`);
    } catch {
      /* user cancelled the picker or denied permission */
    }
  };

  const handleDisconnectBackupFolder = async () => {
    await clearBackupFolder();
    setBackupFolderName(null);
    toast.success('Backup folder disconnected');
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
    <>
      <Header innerClassName="lg:max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </Header>

      <Main className="lg:max-w-2xl">
        {/* Account */}
        <div className="card-elevated divide-border divide-y overflow-hidden rounded-2xl">
          {token && user ? (
            <>
              <div className="bg-grad-primary-soft flex items-center gap-3 p-4">
                <div className="bg-grad-primary shadow-glow-primary flex h-11 w-11 items-center justify-center rounded-full">
                  <User size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
              >
                <LogOut size={18} className="text-destructive" />
                <span className="text-destructive text-sm font-medium">Sign Out</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <div className="bg-grad-primary shadow-glow-primary flex h-10 w-10 items-center justify-center rounded-full">
                  <LogIn size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Sign In</p>
                  <p className="text-muted-foreground text-xs">Sync your data across devices</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Cloud Backup */}
        {token && (
          <div className="card-elevated divide-border divide-y rounded-2xl">
            <button
              onClick={handleCloudBackup}
              disabled={backingUp}
              className="flex w-full items-center gap-3 p-4 disabled:opacity-60"
            >
              <CloudUpload size={18} className="text-muted-foreground" />
              <div className="flex-1 text-left">
                <span className="block text-sm font-medium">
                  {backingUp ? 'Backing up...' : 'Backup to Cloud'}
                </span>
                {lastBackupAt && (
                  <span className="text-muted-foreground text-xs">
                    Last: {new Date(lastBackupAt).toLocaleString()}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={handleCloudRestore}
              disabled={restoring}
              className="flex w-full items-center gap-3 p-4 disabled:opacity-60"
            >
              <Cloud size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">
                {restoring ? 'Restoring...' : 'Restore from Cloud'}
              </span>
            </button>
          </div>
        )}

        {/* Profile name */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <div className="flex items-center gap-3 p-4">
            <div className="bg-grad-primary-soft flex h-10 w-10 items-center justify-center rounded-full">
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
                className="bg-muted h-auto flex-1 rounded-lg border-0 px-3 py-1.5"
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="flex-1 text-left">
                <p className="text-sm font-medium">{settings.userName}</p>
                <p className="text-muted-foreground text-xs">Tap to edit name</p>
              </button>
            )}
          </div>
        </div>

        {/* Preferences */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <div className="flex items-center justify-between p-4">
            <div className="flex w-32 items-center gap-3">
              <span className="text-lg">{currencySymbols[settings.currency]}</span>
              <span className="text-sm font-medium">Currency</span>
            </div>
            <Select
              value={settings.currency}
              onValueChange={(v) => updateSettings({ currency: v as Currency })}
            >
              <SelectTrigger className="bg-muted h-auto rounded-lg border-0 px-3 py-1.5">
                <SelectValue>
                  {currencySymbols[settings.currency]} {settings.currency}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex w-32 items-center gap-3">
              <Palette size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Theme</span>
            </div>
            <Select
              value={settings.theme}
              onValueChange={(v) => updateSettings({ theme: v as Theme })}
            >
              <SelectTrigger className="bg-muted h-auto rounded-lg border-0 px-3 py-1.5">
                <SelectValue>{themes.find((t) => t.value === settings.theme)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

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
        </div>

        {/* Data */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <div className="flex items-center gap-3 p-4">
            <HardDrive size={18} className="text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Auto-download daily backup</p>
              <p className="text-muted-foreground text-xs">Download a backup JSON once per day when the app opens</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.autoLocalBackup}
              onClick={() => updateSettings({ autoLocalBackup: !settings.autoLocalBackup })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                settings.autoLocalBackup ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${
                  settings.autoLocalBackup ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {isFolderPickerSupported() && (
            <div className="flex items-center gap-3 p-4">
              <Folder size={18} className="text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Backup Folder</p>
                <p className="text-muted-foreground text-xs">
                  {backupFolderName
                    ? `Saving to "${backupFolderName}" · keeps latest 10`
                    : 'Not connected — backups use the default Downloads folder'}
                </p>
              </div>
              <button
                onClick={
                  backupFolderName ? handleDisconnectBackupFolder : () => setShowFolderSetupInfo(true)
                }
                className="bg-muted shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                {backupFolderName ? 'Disconnect' : 'Choose Folder'}
              </button>
            </div>
          )}

          <Dialog open={showFolderSetupInfo} onOpenChange={setShowFolderSetupInfo}>
            <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl">
              <DialogHeader>
                <DialogTitle>Set Up Backup Folder</DialogTitle>
                <DialogDescription>
                  In the folder picker that opens next, create a new folder named{' '}
                  <strong className="text-foreground">"Finio"</strong> inside your Downloads
                  folder, then select it. This is the recommended setup — it keeps backups
                  organized in one place and lets Finio automatically keep only the 10 most
                  recent, deleting older ones for you.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Button
                  onClick={handleChooseBackupFolder}
                  className="bg-grad-primary shadow-glow-primary h-auto flex-1 rounded-lg py-2 text-sm font-medium text-white"
                >
                  Continue
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowFolderSetupInfo(false)}
                  className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <button onClick={handleExport} className="flex w-full items-center gap-3 p-4">
            <Download size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Export Data (JSON)</span>
          </button>
          <button onClick={handleImport} className="flex w-full items-center gap-3 p-4">
            <Upload size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Import Data</span>
          </button>
          <button onClick={handleReset} className="flex w-full items-center gap-3 p-4">
            <RotateCcw size={18} className="text-destructive" />
            <span className="text-destructive text-sm font-medium">Reset to Defaults</span>
          </button>
        </div>

        <p className="text-muted-foreground pt-2 text-center text-[11px]">
          Finio · Personal Finance
        </p>
      </Main>
    </>
  );
}
