import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@/data/defaultData';
import type { BackupCryptoConfig } from '@/types';

// The store builds its persist middleware at import time, so localStorage has to exist before
// the module is pulled in. Same Map-backed stub the app-lock store's suite uses.
const backing = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => void backing.set(key, value),
  removeItem: (key: string) => void backing.delete(key),
  clear: () => backing.clear(),
  key: (index: number) => [...backing.keys()][index] ?? null,
  get length() {
    return backing.size;
  },
} as Storage;

const { useBackupCryptoStore } = await import('./useBackupCryptoStore');

function config(partial: Partial<BackupCryptoConfig> = {}): BackupCryptoConfig {
  return {
    enabled: true,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA',
    iterations: 1000,
    verifierIv: 'BBBBBBBBBBBB',
    verifierCiphertext: 'CCCCCCCCCCCC',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

function persisted() {
  return JSON.parse(backing.get('finio-backup-crypto') ?? '{"state":{}}').state as Record<
    string,
    unknown
  >;
}

// A stand-in for a real CryptoKey — the store never inspects it, just holds and persists (or
// doesn't) the reference.
const fakeKey = {} as CryptoKey;

beforeEach(() => {
  backing.clear();
  useBackupCryptoStore.setState({ config: null, sessionKey: null, sessionKeySalt: null });
});

describe('setConfig / clearConfig', () => {
  it('stores a config', () => {
    useBackupCryptoStore.getState().setConfig(config());
    expect(useBackupCryptoStore.getState().config).toMatchObject({ enabled: true });
  });

  it('drops the config and any cached session key', () => {
    useBackupCryptoStore.getState().setConfig(config());
    useBackupCryptoStore.getState().setSessionKey(fakeKey, config().salt);

    useBackupCryptoStore.getState().clearConfig();

    const state = useBackupCryptoStore.getState();
    expect(state.config).toBeNull();
    expect(state.sessionKey).toBeNull();
    expect(state.sessionKeySalt).toBeNull();
  });
});

describe('setSessionKey', () => {
  it('caches a key alongside the salt it was derived from', () => {
    useBackupCryptoStore.getState().setSessionKey(fakeKey, 'some-salt');
    const state = useBackupCryptoStore.getState();
    expect(state.sessionKey).toBe(fakeKey);
    expect(state.sessionKeySalt).toBe('some-salt');
  });

  it('can be cleared back to null', () => {
    useBackupCryptoStore.getState().setSessionKey(fakeKey, 'some-salt');
    useBackupCryptoStore.getState().setSessionKey(null, null);
    const state = useBackupCryptoStore.getState();
    expect(state.sessionKey).toBeNull();
    expect(state.sessionKeySalt).toBeNull();
  });
});

describe('persistence', () => {
  it('stores the config but never the session key', () => {
    // Regression guard for `partialize`: persisting the key would defeat the whole feature, and
    // it isn't even possible since a CryptoKey isn't JSON-serializable — this also catches a
    // refactor that accidentally tries.
    useBackupCryptoStore.getState().setConfig(config());
    useBackupCryptoStore.getState().setSessionKey(fakeKey, config().salt);

    const state = persisted();
    expect(state.config).toMatchObject({ enabled: true, salt: config().salt });
    expect(state).not.toHaveProperty('sessionKey');
    expect(state).not.toHaveProperty('sessionKeySalt');
  });

  it('starts every session with no cached key, even with a persisted config', () => {
    useBackupCryptoStore.getState().setConfig(config());
    expect(useBackupCryptoStore.getState().sessionKey).toBeNull();
  });
});

describe('separation from the finance store', () => {
  it('keeps every backup-crypto field out of Settings, and so out of every backup', () => {
    // `services/backup.ts` serializes `settings` into exported JSON and cloud uploads. Key
    // material there would travel in the very payload it's meant to protect. This catches a
    // refactor that moves the config into Settings.
    const settingsKeys = Object.keys(defaultSettings);
    expect(settingsKeys.filter((key) => /salt|cipher|verifier|passphrase/i.test(key))).toEqual([]);
  });
});
