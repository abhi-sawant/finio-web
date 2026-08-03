import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBackupCryptoStore } from '@/store/useBackupCryptoStore';
import { api } from './api';
import {
  getSavedDirectoryHandle,
  hasWritePermission,
  isFolderPickerSupported,
  writeBackupAndRotate,
} from './backupFolder';
import { validateBackup } from '@/utils/importValidation';
import { downloadBlob } from './download';
import {
  createVerifier,
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  isEncryptedEnvelope,
  packEnvelope,
} from '@/utils/backupCrypto';
import type { FinanceStore } from '@/types';

/** Thrown when a cloud restore hits an encrypted backup and no usable key is cached — the
 *  caller (Settings UI) catches this specifically to prompt for the passphrase and retry,
 *  rather than reporting it as a generic failure. */
export class PassphraseRequiredError extends Error {
  constructor() {
    super('This backup is encrypted. Enter your passphrase to restore it.');
    this.name = 'PassphraseRequiredError';
  }
}

export type BackupPayload = Pick<
  FinanceStore,
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'labels'
  | 'budgets'
  | 'recurring'
  | 'templates'
  | 'rules'
  | 'goals'
  | 'goalContributions'
  | 'people'
  | 'debtEntries'
  | 'netWorthSnapshots'
  | 'loans'
  | 'loanPrepayments'
  | 'settings'
>;

/**
 * Single source of truth for "what's in a backup". uploadBackup, autoLocalBackupIfNeeded and
 * the manual JSON export in Settings all call this rather than each maintaining their own copy
 * of the entity list — the return type annotation makes a key missing from the object literal
 * a compile error, so a new FinanceStore collection can't silently drop out of every backup.
 */
export function collectBackupPayload(): BackupPayload {
  const {
    accounts,
    transactions,
    categories,
    labels,
    budgets,
    recurring,
    templates,
    rules,
    goals,
    goalContributions,
    people,
    debtEntries,
    netWorthSnapshots,
    loans,
    loanPrepayments,
    settings,
  } = useFinanceStore.getState();
  return {
    accounts,
    transactions,
    categories,
    labels,
    budgets,
    recurring,
    templates,
    rules,
    goals,
    goalContributions,
    people,
    debtEntries,
    netWorthSnapshots,
    loans,
    loanPrepayments,
    settings,
  };
}

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

  downloadBlob(filename, contents, 'application/json');
}

/** Exports the current state as a local backup file, with today's date in the filename —
 *  used both by the Data section's "Export Data" button and the app-lock PIN setup dialog's
 *  "export a backup first" safety net. */
export async function exportLocalBackup(): Promise<void> {
  const data = collectBackupPayload();
  const filename = `finio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await saveLocalBackup(filename, JSON.stringify(data, null, 2), { allowPrompt: true });
}

/** True when the cached session key can encrypt/decrypt for the currently configured salt. */
function hasUsableSessionKey(salt: string): CryptoKey | null {
  const { sessionKey, sessionKeySalt } = useBackupCryptoStore.getState();
  return sessionKey && sessionKeySalt === salt ? sessionKey : null;
}

export async function uploadBackup(): Promise<string> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');

  const payload = collectBackupPayload();

  const { config } = useBackupCryptoStore.getState();
  if (config?.enabled) {
    const key = hasUsableSessionKey(config.salt);
    if (!key) throw new Error('Cloud backup is locked — enter your passphrase to continue.');
    const { iv, ciphertext } = await encryptJson(key, payload);
    const envelope = packEnvelope({ salt: config.salt, iterations: config.iterations, iv, ciphertext });
    await api.uploadBackup(token, envelope);
  } else {
    await api.uploadBackup(token, payload);
  }

  const now = new Date().toISOString();
  useAuthStore.getState().setLastBackupAt(now);
  return now;
}

/**
 * Decodes a fetched backup response, decrypting it first if it's an encrypted envelope.
 * Legacy plaintext backups (no `enc` field) pass straight through unchanged.
 *
 * On a successful decrypt with a passphrase that doesn't match the locally cached session key —
 * a fresh session, a rotated passphrase, or a brand-new device with no local config at all — the
 * derived key is adopted as the session key, and local config is seeded/updated from the
 * envelope's own salt/iterations if it doesn't already match. That's what makes cross-device
 * restore self-healing: a new device has nothing local to go on but the passphrase and the
 * envelope it just fetched.
 */
async function decodeBackupResponse(raw: unknown, passphrase?: string): Promise<unknown> {
  if (!isEncryptedEnvelope(raw)) return raw;

  const cached = hasUsableSessionKey(raw.salt);
  let key: CryptoKey;
  if (cached) {
    key = cached;
  } else {
    if (!passphrase) throw new PassphraseRequiredError();
    key = await deriveEncryptionKey(passphrase, raw.salt, raw.iterations);
  }

  let plaintext: unknown;
  try {
    plaintext = await decryptJson(key, raw.iv, raw.ciphertext);
  } catch {
    throw new Error('Incorrect passphrase');
  }

  if (!cached) {
    useBackupCryptoStore.getState().setSessionKey(key, raw.salt);
    const { config } = useBackupCryptoStore.getState();
    if (!config || config.salt !== raw.salt) {
      const verifier = await createVerifier(key);
      useBackupCryptoStore.getState().setConfig({
        enabled: true,
        salt: raw.salt,
        iterations: raw.iterations,
        verifierIv: verifier.iv,
        verifierCiphertext: verifier.ciphertext,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return plaintext;
}

export async function restoreLatestBackup(passphrase?: string): Promise<void> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');
  const res = await api.getLatestBackup(token);
  const decoded = await decodeBackupResponse(res, passphrase);
  // Cloud payloads get the same validation as a hand-picked file — a malformed backup
  // must not be able to corrupt local state.
  const { data } = validateBackup(decoded);
  useFinanceStore.getState().importData(data, { mode: 'replace' });
}

export async function listCloudBackups() {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');
  const { backups } = await api.listBackups(token);
  return backups;
}

export async function restoreBackupByDate(date: string, passphrase?: string): Promise<void> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');
  const res = await api.getBackup(token, date);
  const decoded = await decodeBackupResponse(res, passphrase);
  const { data } = validateBackup(decoded);
  useFinanceStore.getState().importData(data, { mode: 'replace' });
}

export async function deleteCloudBackup(date: string): Promise<void> {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Not signed in');
  await api.deleteBackup(token, date);
}

export async function autoLocalBackupIfNeeded(): Promise<void> {
  const {
    accounts,
    transactions,
    budgets,
    recurring,
    goals,
    people,
    settings,
    lastLocalBackupAt,
    setLastLocalBackupAt,
  } = useFinanceStore.getState();

  if (!settings.autoLocalBackup) return;

  if (
    accounts.length === 0 &&
    transactions.length === 0 &&
    budgets.length === 0 &&
    recurring.length === 0 &&
    goals.length === 0 &&
    people.length === 0
  )
    return;

  const today = new Date().toISOString().slice(0, 10);
  if (lastLocalBackupAt === today) return;

  try {
    const data = collectBackupPayload();
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

  // Encryption is on but no session key is cached (e.g. a fresh app launch) — there's no user
  // present to prompt for the passphrase, so skip silently and let the Settings "locked" banner
  // pick this back up. Same best-effort spirit as autoLocalBackupIfNeeded's catch-all below.
  const { config: cryptoConfig } = useBackupCryptoStore.getState();
  if (cryptoConfig?.enabled && !hasUsableSessionKey(cryptoConfig.salt)) return;

  const { accounts, transactions, budgets, recurring, goals, people } = useFinanceStore.getState();
  if (
    accounts.length === 0 &&
    transactions.length === 0 &&
    budgets.length === 0 &&
    recurring.length === 0 &&
    goals.length === 0 &&
    people.length === 0
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
