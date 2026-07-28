import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@/data/defaultData';
import type { AppLockConfig } from '@/types';

// The store builds its persist middleware at import time, so localStorage has to exist before
// the module is pulled in. Same Map-backed stub the finance store's suite uses.
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

const { useAppLockStore } = await import('./useAppLockStore');

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();

function config(partial: Partial<AppLockConfig> = {}): AppLockConfig {
  return {
    enabled: true,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA',
    hash: 'BBBBBBBBBBBBBBBBBBBBBB',
    iterations: 1000,
    pinLength: 4,
    autoLockMinutes: 1,
    webauthnCredentialId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

function persisted() {
  return JSON.parse(backing.get('finio-lock') ?? '{"state":{}}').state as Record<string, unknown>;
}

beforeEach(() => {
  backing.clear();
  useAppLockStore.setState({
    config: null,
    failedAttempts: 0,
    lockedOutUntil: null,
    isLocked: false,
    isReady: true,
  });
});

describe('lock and unlock', () => {
  it('flips the transient locked flag', () => {
    useAppLockStore.getState().lock();
    expect(useAppLockStore.getState().isLocked).toBe(true);

    useAppLockStore.getState().unlock();
    expect(useAppLockStore.getState().isLocked).toBe(false);
  });

  it('clears the failure count and cooldown on a successful unlock', () => {
    useAppLockStore.setState({ failedAttempts: 6, lockedOutUntil: NOW + 30_000 });

    useAppLockStore.getState().unlock();

    expect(useAppLockStore.getState().failedAttempts).toBe(0);
    expect(useAppLockStore.getState().lockedOutUntil).toBeNull();
  });
});

describe('registerFailure', () => {
  it('counts up without a cooldown for the first few attempts', () => {
    const { registerFailure } = useAppLockStore.getState();
    registerFailure(NOW);
    registerFailure(NOW);

    expect(useAppLockStore.getState().failedAttempts).toBe(2);
    expect(useAppLockStore.getState().lockedOutUntil).toBeNull();
  });

  it('starts the cooldown on the fifth wrong PIN', () => {
    const { registerFailure } = useAppLockStore.getState();
    for (let i = 0; i < 5; i += 1) registerFailure(NOW);

    expect(useAppLockStore.getState().failedAttempts).toBe(5);
    expect(useAppLockStore.getState().lockedOutUntil).toBe(NOW + 15_000);
  });
});

describe('persistence', () => {
  it('stores the config but never the transient flags', () => {
    // Regression guard for `partialize`: persisting `isLocked` would let a reload decide the
    // lock state instead of `shouldLockOnResume`.
    useAppLockStore.getState().setConfig(config());
    useAppLockStore.getState().lock();

    const state = persisted();
    expect(state.config).toMatchObject({ enabled: true, pinLength: 4 });
    expect(state).not.toHaveProperty('isLocked');
    expect(state).not.toHaveProperty('isReady');
  });

  it('keeps the failure count across a reload, so a refresh does not reset the cooldown', () => {
    useAppLockStore.getState().registerFailure(NOW);

    expect(persisted().failedAttempts).toBe(1);
  });
});

describe('clearConfig', () => {
  it('drops the PIN, the biometric credential and any cooldown', () => {
    useAppLockStore.getState().setConfig(config({ webauthnCredentialId: 'cred-1' }));
    useAppLockStore.getState().registerFailure(NOW);

    useAppLockStore.getState().clearConfig();

    const state = useAppLockStore.getState();
    expect(state.config).toBeNull();
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedOutUntil).toBeNull();
    expect(state.isLocked).toBe(false);
  });
});

describe('config mutators', () => {
  it('updates the auto-lock delay in place', () => {
    useAppLockStore.getState().setConfig(config({ autoLockMinutes: 1 }));
    useAppLockStore.getState().setAutoLockMinutes(15);
    expect(useAppLockStore.getState().config?.autoLockMinutes).toBe(15);
  });

  it('forgets the biometric credential without touching the PIN', () => {
    useAppLockStore.getState().setConfig(config({ webauthnCredentialId: 'cred-1' }));
    useAppLockStore.getState().setWebauthnCredentialId(null);

    const { config: stored } = useAppLockStore.getState();
    expect(stored?.webauthnCredentialId).toBeNull();
    expect(stored?.hash).toBe(config().hash);
  });

  it('does nothing when there is no config to mutate', () => {
    useAppLockStore.getState().setAutoLockMinutes(15);
    expect(useAppLockStore.getState().config).toBeNull();
  });
});

describe('separation from the finance store', () => {
  it('keeps every lock field out of Settings, and so out of every backup', () => {
    // `services/backup.ts` serializes `settings` into exported JSON and cloud uploads. A PIN
    // hash there would travel off-device, and restoring the backup elsewhere would install this
    // device's PIN on it. This catches a refactor that moves the config into Settings.
    const settingsKeys = Object.keys(defaultSettings);
    expect(settingsKeys.filter((key) => /pin|lock/i.test(key))).toEqual([]);
  });
});
