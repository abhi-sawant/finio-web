import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from './api';
import {
  getSavedDirectoryHandle,
  hasWritePermission,
  isFolderPickerSupported,
  writeBackupAndRotate,
} from './backupFolder';
import type { FinanceStore } from '@/types';

type BackupPayload = Pick<
  FinanceStore,
  'accounts' | 'transactions' | 'categories' | 'labels' | 'budgets' | 'recurring' | 'settings'
>;

let backupInProgress = false;
const MAX_LOCAL_BACKUPS = 10;

/**
 * Saves a local backup file. If a Finio backup folder is connected (Chromium-only File
 * System Access API) and permission is available, writes into it and rotates old backups
 * beyond MAX_LOCAL_BACKUPS. Otherwise falls back to a plain browser download.
 */
export async function saveLocalBackup(
  filename: string,
  contents: string,
  { allowPrompt }: { allowPrompt: boolean },
): Promise<void> {
  if (isFolderPickerSupported()) {
    const handle = await getSavedDirectoryHandle();
    if (handle && (await hasWritePermission(handle, { prompt: allowPrompt }))) {
      await writeBackupAndRotate(handle, filename, contents, MAX_LOCAL_BACKUPS);
      return;
    }
  }

  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadBackup(): Promise<string> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');

  const { accounts, transactions, categories, labels, budgets, recurring, settings } =
    useFinanceStore.getState();
  const payload: BackupPayload = {
    accounts,
    transactions,
    categories,
    labels,
    budgets,
    recurring,
    settings,
  };
  await api.uploadBackup(token, payload);

  const now = new Date().toISOString();
  useAuthStore.getState().setLastBackupAt(now);
  return now;
}

export async function restoreLatestBackup(): Promise<void> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');
  const res = await api.getLatestBackup(token);
  useFinanceStore.getState().importData(res as Partial<BackupPayload>);
}

export async function autoLocalBackupIfNeeded(): Promise<void> {
  const { accounts, transactions, budgets, recurring, settings, lastLocalBackupAt, setLastLocalBackupAt } =
    useFinanceStore.getState();

  if (!settings.autoLocalBackup) return;

  if (
    accounts.length === 0 &&
    transactions.length === 0 &&
    budgets.length === 0 &&
    recurring.length === 0
  )
    return;

  const today = new Date().toISOString().slice(0, 10);
  if (lastLocalBackupAt === today) return;

  try {
    const { categories, labels } = useFinanceStore.getState();
    const data = { accounts, transactions, categories, labels, budgets, recurring, settings };
    // No user gesture here (runs from a mount effect), so never prompt for folder permission.
    await saveLocalBackup(`finio-backup-${today}.json`, JSON.stringify(data, null, 2), {
      allowPrompt: false,
    });
    setLastLocalBackupAt(today);
  } catch {
    /* silent failure — backup is best-effort */
  }
}

export async function autoBackupIfNeeded(): Promise<void> {
  if (backupInProgress) return;

  const { token, lastBackupAt } = useAuthStore.getState();
  if (!token) return;

  const { accounts, transactions, budgets, recurring } = useFinanceStore.getState();
  if (
    accounts.length === 0 &&
    transactions.length === 0 &&
    budgets.length === 0 &&
    recurring.length === 0
  )
    return;

  if (!lastBackupAt) {
    backupInProgress = true;
    try {
      await uploadBackup();
    } finally {
      backupInProgress = false;
    }
    return;
  }

  const hoursSinceLast = (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLast >= 24) {
    backupInProgress = true;
    try {
      await uploadBackup();
    } finally {
      backupInProgress = false;
    }
  }
}
