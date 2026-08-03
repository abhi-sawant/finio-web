import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronRight,
  Cloud,
  CloudUpload,
  History,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  HardDrive,
  Folder,
  Download,
  Upload,
  FileSpreadsheet,
  Scale,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBackupCryptoStore } from '@/store/useBackupCryptoStore';
import {
  uploadBackup,
  restoreLatestBackup,
  listCloudBackups,
  restoreBackupByDate,
  deleteCloudBackup,
  exportLocalBackup,
  PassphraseRequiredError,
} from '@/services/backup';
import {
  isBackupCryptoSupported,
  generateBackupSalt,
  deriveEncryptionKey,
  createVerifier,
  verifyPassphraseAgainstConfig,
  BACKUP_KEY_ITERATIONS,
} from '@/utils/backupCrypto';
import {
  chooseBackupFolder,
  clearBackupFolder,
  getSavedDirectoryHandle,
  isFolderPickerSupported,
} from '@/services/backupFolder';
import { refreshNotificationSchedule, resetNotificationData } from '@/services/notifications';
import { Input } from '@/components/ui/input';
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
import { SecretDialogShell, SecretDialogError } from './SecretDialogShell';
import {
  ENTITY_LABELS,
  IMPORT_ENTITIES,
  validateBackup,
  type ValidatedBackup,
} from '@/utils/importValidation';
import { formatCurrency, formatFileSize, formatFullDate } from '@/utils/formatters';
import type { ImportMode } from '@/types';

type CryptoDialogKind = 'set' | 'change' | 'disable' | 'unlock' | 'restore';
type CryptoPhase = 'current' | 'enter' | 'confirm';

type BackupListEntry = { backup_date: string; file_size: number; created_at: string };

export function BackupSection() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const settings = useFinanceStore((s) => s.settings);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const importData = useFinanceStore((s) => s.importData);
  const recomputeBalances = useFinanceStore((s) => s.recomputeBalances);
  const resetToDefaults = useFinanceStore((s) => s.resetToDefaults);

  const token = useAuthStore((s) => s.token);
  const lastBackupAt = useAuthStore((s) => s.lastBackupAt);

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  const [showFolderSetupInfo, setShowFolderSetupInfo] = useState(false);
  const [preview, setPreview] = useState<(ValidatedBackup & { file: File }) | null>(null);

  const [showBackupHistory, setShowBackupHistory] = useState(false);
  const [backupList, setBackupList] = useState<BackupListEntry[] | null>(null);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [busyBackupDate, setBusyBackupDate] = useState<string | null>(null);

  const cryptoConfig = useBackupCryptoStore((s) => s.config);
  const setCryptoConfig = useBackupCryptoStore((s) => s.setConfig);
  const clearCryptoConfig = useBackupCryptoStore((s) => s.clearConfig);
  const sessionKeySalt = useBackupCryptoStore((s) => s.sessionKeySalt);
  const setSessionKey = useBackupCryptoStore((s) => s.setSessionKey);
  const cryptoEnabled = cryptoConfig?.enabled === true;
  // True once enabled but the in-memory key hasn't been (re-)entered this session — a fresh
  // launch, or a rotated passphrase whose salt no longer matches whatever is cached.
  const cryptoLocked = cryptoEnabled && sessionKeySalt !== cryptoConfig?.salt;

  const [cryptoDialog, setCryptoDialog] = useState<CryptoDialogKind | null>(null);
  const [cryptoPhase, setCryptoPhase] = useState<CryptoPhase>('enter');
  const [passphraseEntry, setPassphraseEntry] = useState('');
  const [firstPassphrase, setFirstPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [passphraseBusy, setPassphraseBusy] = useState(false);
  // null means "restore latest" — set to a date to restore that dated backup instead.
  const [pendingRestoreDate, setPendingRestoreDate] = useState<string | null>(null);

  useEffect(() => {
    if (!isFolderPickerSupported()) return;
    getSavedDirectoryHandle().then((handle) => setBackupFolderName(handle?.name ?? null));
  }, []);

  const handleExport = async () => {
    try {
      await exportLocalBackup();
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
    // The pending schedule points at the budgets and rules that were just replaced.
    refreshNotificationSchedule();
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
      // Schedule and fired-ledger live in IndexedDB, which a store reset does not touch —
      // without this, a reminder would fire for a budget that no longer exists.
      resetNotificationData();
      toast.success('Reset complete');
    }
  };

  const handleCloudBackup = async () => {
    if (cryptoLocked) {
      openCryptoDialog('unlock');
      return;
    }
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
      if (err instanceof PassphraseRequiredError) {
        openRestorePassphrasePrompt(null);
      } else {
        toast.error(err instanceof Error ? err.message : 'Restore failed');
      }
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
      if (err instanceof PassphraseRequiredError) {
        openRestorePassphrasePrompt(date);
      } else {
        toast.error(err instanceof Error ? err.message : 'Restore failed');
      }
    } finally {
      setBusyBackupDate(null);
    }
  };

  const closeCryptoDialog = () => {
    setCryptoDialog(null);
    setCryptoPhase('enter');
    setPassphraseEntry('');
    setFirstPassphrase('');
    setPassphraseError(null);
    setPassphraseBusy(false);
    setPendingRestoreDate(null);
  };

  const openCryptoDialog = (which: Exclude<CryptoDialogKind, 'restore'>) => {
    setPassphraseEntry('');
    setFirstPassphrase('');
    setPassphraseError(null);
    setCryptoPhase(which === 'set' ? 'enter' : 'current');
    setCryptoDialog(which);
  };

  const openRestorePassphrasePrompt = (date: string | null) => {
    setPassphraseEntry('');
    setPassphraseError(null);
    setPendingRestoreDate(date);
    setCryptoDialog('restore');
  };

  /** Same reasoning as the app lock's toggle: both directions need input, so the switch opens
   *  a dialog rather than writing state optimistically. */
  const handleToggleBackupEncryption = (next: boolean) => openCryptoDialog(next ? 'set' : 'disable');

  const saveBackupPassphrase = async (passphrase: string) => {
    setPassphraseBusy(true);
    try {
      const salt = generateBackupSalt();
      const key = await deriveEncryptionKey(passphrase, salt, BACKUP_KEY_ITERATIONS);
      const verifier = await createVerifier(key);
      setCryptoConfig({
        enabled: true,
        salt,
        iterations: BACKUP_KEY_ITERATIONS,
        verifierIv: verifier.iv,
        verifierCiphertext: verifier.ciphertext,
        createdAt: new Date().toISOString(),
      });
      setSessionKey(key, salt);
      const wasChanging = cryptoDialog === 'change';
      closeCryptoDialog();
      toast.success(wasChanging ? 'Backup passphrase changed' : 'Cloud backups are now encrypted');
    } finally {
      setPassphraseBusy(false);
    }
  };

  const handleCryptoPassphraseSubmit = async () => {
    if (passphraseBusy || passphraseEntry.length === 0) return;
    setPassphraseError(null);

    if (cryptoDialog === 'unlock' || cryptoPhase === 'current') {
      if (!cryptoConfig) return;
      setPassphraseBusy(true);
      const key = await deriveEncryptionKey(passphraseEntry, cryptoConfig.salt, cryptoConfig.iterations);
      const ok = await verifyPassphraseAgainstConfig(key, cryptoConfig);
      setPassphraseBusy(false);

      if (!ok) {
        setPassphraseError('Incorrect passphrase');
        setPassphraseEntry('');
        return;
      }

      if (cryptoDialog === 'disable') {
        clearCryptoConfig();
        closeCryptoDialog();
        toast.success('Cloud backup encryption is off');
        return;
      }

      if (cryptoDialog === 'unlock') {
        setSessionKey(key, cryptoConfig.salt);
        closeCryptoDialog();
        toast.success('Cloud backup unlocked for this session');
        return;
      }

      // 'change' — current passphrase verified, move on to choosing the new one.
      setPassphraseEntry('');
      setCryptoPhase('enter');
      return;
    }

    if (cryptoPhase === 'enter') {
      if (passphraseEntry.length < 8) {
        setPassphraseError('Use at least 8 characters');
        return;
      }
      setFirstPassphrase(passphraseEntry);
      setPassphraseEntry('');
      setCryptoPhase('confirm');
      return;
    }

    if (cryptoPhase === 'confirm') {
      if (passphraseEntry !== firstPassphrase) {
        setPassphraseEntry('');
        setCryptoPhase('enter');
        setPassphraseError("Those didn't match. Try again.");
        return;
      }
      await saveBackupPassphrase(passphraseEntry);
    }
  };

  const handleRestorePassphraseSubmit = async () => {
    if (passphraseBusy || passphraseEntry.length === 0) return;
    setPassphraseError(null);
    setPassphraseBusy(true);
    try {
      if (pendingRestoreDate === null) {
        await restoreLatestBackup(passphraseEntry);
      } else {
        await restoreBackupByDate(pendingRestoreDate, passphraseEntry);
      }
      closeCryptoDialog();
      setShowBackupHistory(false);
      toast.success('Data restored from cloud backup');
    } catch (err) {
      setPassphraseError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setPassphraseBusy(false);
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

  return (
    <>
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
            <span className="text-sm font-medium">{restoring ? 'Restoring...' : 'Restore from Cloud'}</span>
          </button>
          <button onClick={openBackupHistory} className="flex w-full items-center gap-3 p-4">
            <History size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Backup History</span>
          </button>
        </div>
      )}

      {/* Backup Encryption */}
      {token && isBackupCryptoSupported() && (
        <div className="card-elevated divide-border divide-y rounded-2xl">
          <SwitchField
            className="p-4"
            icon={<ShieldCheck size={18} className="text-muted-foreground shrink-0" />}
            title="Encrypt cloud backups"
            description="Encrypt backups with a passphrase before they leave this device. Finio never sees it and can't recover it if you forget it."
            checked={cryptoEnabled}
            onCheckedChange={handleToggleBackupEncryption}
          />

          {cryptoEnabled && (
            <>
              {cryptoLocked && (
                <button
                  onClick={() => openCryptoDialog('unlock')}
                  className="flex w-full items-center gap-3 p-4"
                >
                  <LockKeyhole size={18} className="shrink-0 text-amber-500" />
                  <div className="flex-1 text-left">
                    <span className="block text-sm font-medium">Cloud backup locked</span>
                    <span className="text-muted-foreground text-xs">
                      Tap to enter your passphrase and resume automatic backups
                    </span>
                  </div>
                </button>
              )}
              <button
                onClick={() => openCryptoDialog('change')}
                className="flex w-full items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <KeyRound size={18} className="text-muted-foreground" />
                  <span className="text-sm font-medium">Change passphrase</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      )}

      {/* One dialog for set / change / disable / unlock — same phase machine as the app lock
          PIN dialog, with a text passphrase instead of a PinPad. */}
      <SecretDialogShell
        open={cryptoDialog !== null && cryptoDialog !== 'restore'}
        onOpenChange={(open) => !open && closeCryptoDialog()}
        title={
          cryptoDialog === 'disable'
            ? 'Turn off backup encryption'
            : cryptoDialog === 'unlock'
              ? 'Unlock cloud backup'
              : cryptoDialog === 'change'
                ? 'Change passphrase'
                : 'Set a backup passphrase'
        }
        description={
          cryptoDialog === 'disable'
            ? 'Enter your current passphrase to turn off encryption. Future backups will be plaintext; existing encrypted backups still need this passphrase to restore.'
            : cryptoDialog === 'unlock'
              ? 'Enter your backup passphrase to resume automatic cloud backups for this session.'
              : cryptoPhase === 'current'
                ? 'Enter your current passphrase first.'
                : cryptoPhase === 'confirm'
                  ? 'Enter it once more to confirm.'
                  : "Choose a passphrase you'll remember — it's separate from your account password and can't be recovered if lost."
        }
      >
        <div className="space-y-4">
          <Input
            type="password"
            autoFocus
            value={passphraseEntry}
            onChange={(e) => {
              if (passphraseError) setPassphraseError(null);
              setPassphraseEntry(e.target.value);
            }}
            placeholder={cryptoPhase === 'confirm' ? 'Confirm passphrase' : 'Passphrase'}
            onKeyDown={(e) => e.key === 'Enter' && handleCryptoPassphraseSubmit()}
            disabled={passphraseBusy}
          />
          <SecretDialogError message={passphraseError} />
          <Button
            size="lg"
            className="bg-grad-primary w-full text-white"
            disabled={passphraseBusy || passphraseEntry.length === 0}
            onClick={handleCryptoPassphraseSubmit}
          >
            {cryptoDialog === 'disable' ? 'Turn off' : cryptoPhase === 'confirm' ? 'Confirm' : 'Continue'}
          </Button>
        </div>
      </SecretDialogShell>

      {/* One-shot passphrase prompt for a cloud restore that turned out to be encrypted. */}
      <SecretDialogShell
        open={cryptoDialog === 'restore'}
        onOpenChange={(open) => !open && closeCryptoDialog()}
        title="Enter backup passphrase"
        description="This backup is encrypted. Enter the passphrase it was encrypted with to restore it."
      >
        <div className="space-y-4">
          <Input
            type="password"
            autoFocus
            value={passphraseEntry}
            onChange={(e) => {
              if (passphraseError) setPassphraseError(null);
              setPassphraseEntry(e.target.value);
            }}
            placeholder="Passphrase"
            onKeyDown={(e) => e.key === 'Enter' && handleRestorePassphraseSubmit()}
            disabled={passphraseBusy}
          />
          <SecretDialogError message={passphraseError} />
          <Button
            size="lg"
            className="bg-grad-primary w-full text-white"
            disabled={passphraseBusy || passphraseEntry.length === 0}
            onClick={handleRestorePassphraseSubmit}
          >
            Restore
          </Button>
        </div>
      </SecretDialogShell>

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
              onClick={backupFolderName ? handleDisconnectBackupFolder : () => setShowFolderSetupInfo(true)}
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
        <button onClick={() => navigate('/import-csv')} className="flex w-full items-center gap-3 p-4">
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
                    <p className="text-muted-foreground text-xs">{formatFileSize(backup.file_size)}</p>
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
    </>
  );
}
