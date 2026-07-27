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
  PiggyBank,
  HandCoins,
  HardDrive,
  Scale,
  AlertTriangle,
  CalendarRange,
  History,
  KeyRound,
  Trash2,
  UserX,
  FileSpreadsheet,
  Wand2,
} from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import {
  uploadBackup,
  restoreLatestBackup,
  saveLocalBackup,
  listCloudBackups,
  restoreBackupByDate,
  deleteCloudBackup,
} from '@/services/backup';
import {
  chooseBackupFolder,
  clearBackupFolder,
  getSavedDirectoryHandle,
  isFolderPickerSupported,
} from '@/services/backupFolder';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SwitchField } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/use-confirm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ENTITY_LABELS,
  IMPORT_ENTITIES,
  validateBackup,
  type ValidatedBackup,
} from '@/utils/importValidation';
import { formatCurrency, formatOrdinal, formatFileSize, formatFullDate } from '@/utils/formatters';
import {
  MAX_MONTH_START_DAY,
  MIN_MONTH_START_DAY,
  normalizeMonthStartDay,
  periodLabel,
  periodRange,
} from '@/utils/period';
import type { ImportMode, Theme } from '@/types';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const monthStartDays = Array.from(
  { length: MAX_MONTH_START_DAY - MIN_MONTH_START_DAY + 1 },
  (_, i) => MIN_MONTH_START_DAY + i,
);

export default function Settings() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const settings = useFinanceStore((s) => s.settings);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const resetToDefaults = useFinanceStore((s) => s.resetToDefaults);
  const importData = useFinanceStore((s) => s.importData);
  const recomputeBalances = useFinanceStore((s) => s.recomputeBalances);

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
  const [preview, setPreview] = useState<(ValidatedBackup & { file: File }) | null>(null);
  const [showMonthStartPicker, setShowMonthStartPicker] = useState(false);

  const [showBackupHistory, setShowBackupHistory] = useState(false);
  const [backupList, setBackupList] = useState<Array<{
    backup_date: string;
    file_size: number;
    created_at: string;
  }> | null>(null);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [busyBackupDate, setBusyBackupDate] = useState<string | null>(null);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const monthStartDay = normalizeMonthStartDay(settings.monthStartDay);
  const currentCycleLabel = periodLabel(
    periodRange('monthly', new Date(), monthStartDay),
    monthStartDay,
  );

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
        templates: state.templates,
        rules: state.rules,
        goals: state.goals,
        goalContributions: state.goalContributions,
        people: state.people,
        debtEntries: state.debtEntries,
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
          // Validate and preview first — an import rewrites every row in the app.
          setPreview({ ...validateBackup(JSON.parse(event.target?.result as string)), file });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Invalid backup file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const runImport = (mode: ImportMode) => {
    if (!preview) return;
    importData(preview.data, { mode });
    setPreview(null);
    toast.success(mode === 'merge' ? 'Backup merged' : 'Data replaced from backup');
  };

  const handleReconcile = () => {
    const { changed, totalDrift } = recomputeBalances();
    if (changed === 0) {
      toast.success('All balances already match their transactions');
      return;
    }
    toast.success(
      `Reconciled ${changed} account${changed === 1 ? '' : 's'} · net ${
        totalDrift >= 0 ? '+' : '−'
      }${formatCurrency(Math.abs(totalDrift))}`,
    );
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      title: 'Reset all data?',
      description:
        'Accounts, transactions, budgets, recurring rules, savings goals and people/debts will be erased and categories restored to defaults. This cannot be undone.',
      confirmLabel: 'Reset everything',
    });
    if (confirmed) {
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
    const confirmed = await confirm({
      title: 'Restore from cloud backup?',
      description: 'Your current data will be replaced by the most recent backup on the server.',
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
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

  const openBackupHistory = async () => {
    setShowBackupHistory(true);
    setBackupListLoading(true);
    try {
      const backups = await listCloudBackups();
      setBackupList(backups);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load backup history');
      setBackupList([]);
    } finally {
      setBackupListLoading(false);
    }
  };

  const handleRestoreBackupDate = async (date: string) => {
    const confirmed = await confirm({
      title: `Restore backup from ${formatFullDate(date)}?`,
      description: 'Your current data will be replaced by this backup.',
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    setBusyBackupDate(date);
    try {
      await restoreBackupByDate(date);
      toast.success('Data restored from backup');
      setShowBackupHistory(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusyBackupDate(null);
    }
  };

  const handleDeleteBackupDate = async (date: string) => {
    const confirmed = await confirm({
      title: `Delete backup from ${formatFullDate(date)}?`,
      description: 'This backup will be permanently removed from the server.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    setBusyBackupDate(date);
    try {
      await deleteCloudBackup(date);
      setBackupList((list) => list?.filter((b) => b.backup_date !== date) ?? null);
      toast.success('Backup deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyBackupDate(null);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (!token) return;
    setChangingPassword(true);
    try {
      const res = await api.updateProfile(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAuth(res.token, res.user);
      toast.success('Password changed');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteCloudAccount = async () => {
    if (!token || !deleteAccountPassword) return;
    setDeletingAccount(true);
    try {
      await api.deleteAccount(token, deleteAccountPassword);
      clearAuth();
      setShowDeleteAccount(false);
      setDeleteAccountPassword('');
      toast.success('Cloud account and backups permanently deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
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

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      description: 'Your finance data stays on this device — only cloud backup is disconnected.',
      confirmLabel: 'Sign out',
    });
    if (confirmed) {
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
                onClick={() => setShowChangePassword(true)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
              >
                <KeyRound size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium">Change Password</span>
              </button>
              <button
                onClick={handleLogout}
                className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
              >
                <LogOut size={18} className="text-destructive" />
                <span className="text-destructive text-sm font-medium">Sign Out</span>
              </button>
              <button
                onClick={() => setShowDeleteAccount(true)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
              >
                <UserX size={18} className="text-destructive" />
                <span className="text-destructive text-sm font-medium">Delete Cloud Account</span>
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
            <button onClick={openBackupHistory} className="flex w-full items-center gap-3 p-4">
              <History size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Backup History</span>
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
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CalendarRange size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Month starts on</p>
                <p className="text-muted-foreground truncate text-xs">
                  Current cycle: {currentCycleLabel}
                </p>
              </div>
            </div>
            {/* A grid beats a 28-item dropdown here — every day is one tap away. */}
            <button
              onClick={() => setShowMonthStartPicker(true)}
              className="bg-muted shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              {formatOrdinal(monthStartDay)}
            </button>
          </div>

          <Dialog open={showMonthStartPicker} onOpenChange={setShowMonthStartPicker}>
            <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Month starts on</DialogTitle>
                <DialogDescription>
                  Every "this month" total and monthly budget will run from this day to the day
                  before it in the next month.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-7 gap-1.5">
                {monthStartDays.map((day) => (
                  <button
                    key={day}
                    onClick={() => {
                      updateSettings({ monthStartDay: day });
                      setShowMonthStartPicker(false);
                    }}
                    className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                      day === monthStartDay
                        ? 'bg-grad-primary text-white'
                        : 'bg-muted hover:bg-muted/70'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Days after the 28th aren't offered — they don't exist in every month.
              </p>
            </DialogContent>
          </Dialog>
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

        {/* Data */}
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <SwitchField
            className="p-4"
            icon={<HardDrive size={18} className="text-muted-foreground shrink-0" />}
            title="Auto-download daily backup"
            description="Download a backup JSON once per day when the app opens"
            checked={settings.autoLocalBackup}
            onCheckedChange={(autoLocalBackup) => updateSettings({ autoLocalBackup })}
          />
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
                  backupFolderName
                    ? handleDisconnectBackupFolder
                    : () => setShowFolderSetupInfo(true)
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
                  <strong className="text-foreground">"Finio"</strong> inside your Downloads folder,
                  then select it. This is the recommended setup — it keeps backups organized in one
                  place and lets Finio automatically keep only the 10 most recent, deleting older
                  ones for you.
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
          <button
            onClick={() => navigate('/import-csv')}
            className="flex w-full items-center gap-3 p-4"
          >
            <FileSpreadsheet size={18} className="text-muted-foreground" />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">Import Bank CSV</p>
              <p className="text-muted-foreground text-xs">
                Map columns from a bank or card statement export
              </p>
            </div>
          </button>
          <button onClick={handleReconcile} className="flex w-full items-center gap-3 p-4">
            <Scale size={18} className="text-muted-foreground shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">Reconcile Balances</p>
              <p className="text-muted-foreground text-xs">
                Rebuild every account balance from its opening balance and transactions
              </p>
            </div>
          </button>
          <button onClick={handleReset} className="flex w-full items-center gap-3 p-4">
            <RotateCcw size={18} className="text-destructive" />
            <span className="text-destructive text-sm font-medium">Reset to Defaults</span>
          </button>
        </div>

        {/* Import dry-run preview */}
        <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="bg-card mx-auto max-h-[70vh] w-11/12 overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Review Import</DialogTitle>
              <DialogDescription className="truncate">{preview?.file.name}</DialogDescription>
            </DialogHeader>

            {preview && (
              <div className="space-y-3">
                <ul className="divide-border divide-y text-sm">
                  {IMPORT_ENTITIES.filter((entity) => preview.report.counts[entity].present).map(
                    (entity) => {
                      const count = preview.report.counts[entity];
                      return (
                        <li key={entity} className="flex items-center justify-between py-2">
                          <span className="text-muted-foreground">{ENTITY_LABELS[entity]}</span>
                          <span className="font-medium">
                            {count.accepted}
                            {count.rejected > 0 && (
                              <span className="text-destructive ml-2 text-xs font-normal">
                                {count.rejected} skipped
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    },
                  )}
                  {preview.report.hasSettings && (
                    <li className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Settings</span>
                      <span className="font-medium">included</span>
                    </li>
                  )}
                </ul>

                {(preview.report.warnings.length > 0 || preview.report.issues.length > 0) && (
                  <div className="bg-muted/50 space-y-1.5 rounded-xl p-3">
                    {preview.report.warnings.map((warning) => (
                      <p key={warning} className="flex gap-2 text-xs">
                        <AlertTriangle size={14} className="mt-px shrink-0 text-amber-500" />
                        <span>{warning}</span>
                      </p>
                    ))}
                    {preview.report.issues.map((issue) => (
                      <p key={issue} className="text-muted-foreground text-xs">
                        {issue}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-muted-foreground text-xs">
                  Balances are recalculated from transactions after either option.
                </p>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => runImport('merge')}
                    className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white"
                  >
                    Merge with existing data
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => runImport('replace')}
                      className="text-destructive bg-muted h-auto flex-1 rounded-lg py-2.5 text-sm font-medium"
                    >
                      Replace everything
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPreview(null)}
                      className="bg-muted text-muted-foreground h-auto rounded-lg px-4 py-2.5 text-sm font-medium"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Backup history */}
        <Dialog open={showBackupHistory} onOpenChange={setShowBackupHistory}>
          <DialogContent className="bg-card mx-auto max-h-[70vh] w-11/12 overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Backup History</DialogTitle>
              <DialogDescription>Every backup version stored on the server.</DialogDescription>
            </DialogHeader>

            {backupListLoading ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Loading...</p>
            ) : !backupList || backupList.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No backups found</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {backupList.map((backup) => (
                  <li key={backup.backup_date} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{formatFullDate(backup.backup_date)}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatFileSize(backup.file_size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="secondary"
                        disabled={busyBackupDate === backup.backup_date}
                        onClick={() => handleRestoreBackupDate(backup.backup_date)}
                        className="bg-muted h-auto rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyBackupDate === backup.backup_date}
                        onClick={() => handleDeleteBackupDate(backup.backup_date)}
                        className="text-destructive h-8 w-8 rounded-lg"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>

        {/* Change password */}
        <Dialog
          open={showChangePassword}
          onOpenChange={(open) => {
            setShowChangePassword(open);
            if (!open) {
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }
          }}
        >
          <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>Sign in on other devices again after this.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-xs font-medium">Current Password</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium">New Password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium">Confirm New Password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword}
                className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete cloud account */}
        <Dialog
          open={showDeleteAccount}
          onOpenChange={(open) => {
            setShowDeleteAccount(open);
            if (!open) setDeleteAccountPassword('');
          }}
        >
          <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Cloud Account?</DialogTitle>
              <DialogDescription>
                Your account and every backup on the server will be permanently deleted. This cannot
                be undone. Finance data on this device is not affected.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-xs font-medium">Confirm Password</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
                />
              </div>
              <Button
                onClick={handleDeleteCloudAccount}
                disabled={deletingAccount || !deleteAccountPassword}
                className="bg-destructive h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <p className="text-muted-foreground pt-2 text-center text-[11px]">
          Finio · Personal Finance
        </p>
      </Main>
    </>
  );
}
