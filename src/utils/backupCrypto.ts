import { fromBase64Url, generateSalt, toBase64Url } from './pinCrypto';

/**
 * Client-side encryption for cloud backups.
 *
 * A passphrase-derived AES-GCM key encrypts the backup payload before it ever leaves the device;
 * the server only ever stores the envelope below, which is opaque without the passphrase. The
 * salt travels inside the envelope (not just in local config) so a brand-new device — which has
 * no local encryption config at all — can still derive the same key from the passphrase and the
 * fetched backup alone. There is deliberately no server-side escrow: losing the passphrase means
 * losing every cloud backup encrypted under it, which is the guarantee this feature is for, not
 * a gap in it.
 *
 * PBKDF2-SHA256 at 600,000 iterations — OWASP's current baseline for this hash. This is a fresh,
 * deliberate choice, not a reuse of `PIN_HASH_ITERATIONS` from `pinCrypto.ts`: that count is tuned
 * to stay near a quarter second on a low-end phone for a short numeric PIN, a materially weaker
 * secret than a user-chosen passphrase, so it targets a different point on the cost/security
 * curve.
 */
export const BACKUP_KEY_ITERATIONS = 600_000;
const GCM_IV_BYTES = 12;
const BACKUP_SALT_BYTES = 16;

/** Encrypted under a candidate key and compared back, to confirm a passphrase without needing an
 *  actual backup to test it against (used by "change passphrase" and the session-unlock prompt). */
const VERIFIER_PLAINTEXT = 'finio-backup-verify-v1';

export interface BackupEnvelope {
  v: 1;
  enc: true;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url, travels with the backup so a new device can derive the same key. */
  salt: string;
  /** base64url, 12 random bytes. */
  iv: string;
  /** base64url. */
  ciphertext: string;
}

/** Same guard as `isPinCryptoSupported()` — false in a non-secure context. */
export function isBackupCryptoSupported(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export function generateBackupSalt(): string {
  return generateSalt(BACKUP_SALT_BYTES);
}

export async function deriveEncryptionKey(
  passphrase: string,
  saltB64: string,
  iterations: number = BACKUP_KEY_ITERATIONS,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64Url(saltB64), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(
  key: CryptoKey,
  data: unknown,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(cipherBuffer)) };
}

/**
 * Throws on a wrong key or tampered ciphertext — GCM's authentication tag makes that the natural
 * signal for "incorrect passphrase," with no separate verification step required.
 */
export async function decryptJson(key: CryptoKey, iv: string, ciphertext: string): Promise<unknown> {
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

export async function createVerifier(key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  return encryptJson(key, VERIFIER_PLAINTEXT);
}

/** Never throws — a wrong passphrase, corrupted verifier, or anything else unexpected is simply
 *  "not verified," the same contract as `verifyPin`. */
export async function verifyPassphraseAgainstConfig(
  key: CryptoKey,
  verifier: { verifierIv: string; verifierCiphertext: string },
): Promise<boolean> {
  try {
    const plaintext = await decryptJson(key, verifier.verifierIv, verifier.verifierCiphertext);
    return plaintext === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

export function packEnvelope(fields: {
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}): BackupEnvelope {
  return { v: 1, enc: true, kdf: 'PBKDF2-SHA256', ...fields };
}

export function isEncryptedEnvelope(raw: unknown): raw is BackupEnvelope {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.enc === true &&
    r.v === 1 &&
    typeof r.salt === 'string' &&
    typeof r.iv === 'string' &&
    typeof r.ciphertext === 'string' &&
    typeof r.iterations === 'number'
  );
}
