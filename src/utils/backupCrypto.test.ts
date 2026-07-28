import { describe, expect, it } from 'vitest';
import {
  createVerifier,
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  generateBackupSalt,
  isEncryptedEnvelope,
  packEnvelope,
  verifyPassphraseAgainstConfig,
} from './backupCrypto';

/** Tests use a low iteration count to stay fast; production uses BACKUP_KEY_ITERATIONS. */
const ITERATIONS = 1000;

describe('deriveEncryptionKey', () => {
  it('produces a usable, non-extractable AES-GCM key', async () => {
    const key = await deriveEncryptionKey('correct horse battery staple', generateBackupSalt(), ITERATIONS);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
  });
});

describe('encryptJson / decryptJson', () => {
  it('round-trips arbitrary JSON data', async () => {
    const salt = generateBackupSalt();
    const key = await deriveEncryptionKey('hunter2 hunter2', salt, ITERATIONS);
    const payload = { accounts: [{ id: 'a1', balance: 4200 }], note: 'ñ ünïcode 🎉' };

    const { iv, ciphertext } = await encryptJson(key, payload);
    expect(await decryptJson(key, iv, ciphertext)).toEqual(payload);
  });

  it('fails to decrypt under a key derived from a different passphrase', async () => {
    const salt = generateBackupSalt();
    const key = await deriveEncryptionKey('right passphrase', salt, ITERATIONS);
    const wrongKey = await deriveEncryptionKey('wrong passphrase', salt, ITERATIONS);
    const { iv, ciphertext } = await encryptJson(key, { secret: true });

    await expect(decryptJson(wrongKey, iv, ciphertext)).rejects.toThrow();
  });

  it('fails to decrypt under a key derived from a different salt', async () => {
    const key = await deriveEncryptionKey('same passphrase', generateBackupSalt(), ITERATIONS);
    const otherKey = await deriveEncryptionKey('same passphrase', generateBackupSalt(), ITERATIONS);
    const { iv, ciphertext } = await encryptJson(key, { secret: true });

    await expect(decryptJson(otherKey, iv, ciphertext)).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext', async () => {
    const salt = generateBackupSalt();
    const key = await deriveEncryptionKey('passphrase', salt, ITERATIONS);
    const { iv, ciphertext } = await encryptJson(key, { secret: true });
    const tampered = ciphertext.slice(0, -2) + (ciphertext.slice(-2) === 'AA' ? 'BB' : 'AA');

    await expect(decryptJson(key, iv, tampered)).rejects.toThrow();
  });
});

describe('createVerifier / verifyPassphraseAgainstConfig', () => {
  it('accepts the key that created it', async () => {
    const salt = generateBackupSalt();
    const key = await deriveEncryptionKey('my passphrase', salt, ITERATIONS);
    const verifier = await createVerifier(key);

    expect(
      await verifyPassphraseAgainstConfig(key, {
        verifierIv: verifier.iv,
        verifierCiphertext: verifier.ciphertext,
      }),
    ).toBe(true);
  });

  it('rejects a key derived from a different passphrase, without throwing', async () => {
    const salt = generateBackupSalt();
    const key = await deriveEncryptionKey('my passphrase', salt, ITERATIONS);
    const otherKey = await deriveEncryptionKey('not my passphrase', salt, ITERATIONS);
    const verifier = await createVerifier(key);

    expect(
      await verifyPassphraseAgainstConfig(otherKey, {
        verifierIv: verifier.iv,
        verifierCiphertext: verifier.ciphertext,
      }),
    ).toBe(false);
  });

  it('rejects a malformed verifier instead of throwing', async () => {
    const key = await deriveEncryptionKey('my passphrase', generateBackupSalt(), ITERATIONS);
    expect(
      await verifyPassphraseAgainstConfig(key, { verifierIv: 'not-base64', verifierCiphertext: '???' }),
    ).toBe(false);
  });
});

describe('packEnvelope / isEncryptedEnvelope', () => {
  it('round-trips through the envelope shape', () => {
    const envelope = packEnvelope({ salt: 's', iterations: ITERATIONS, iv: 'i', ciphertext: 'c' });
    expect(envelope).toEqual({
      v: 1,
      enc: true,
      kdf: 'PBKDF2-SHA256',
      salt: 's',
      iterations: ITERATIONS,
      iv: 'i',
      ciphertext: 'c',
    });
    expect(isEncryptedEnvelope(envelope)).toBe(true);
  });

  it('rejects a legacy plaintext backup object', () => {
    expect(isEncryptedEnvelope({ accounts: [], transactions: [] })).toBe(false);
  });

  it('rejects non-objects and near-miss shapes', () => {
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope('a string')).toBe(false);
    expect(isEncryptedEnvelope({ enc: true, v: 1 })).toBe(false);
  });
});
