import { describe, expect, it, beforeEach } from 'vitest';
import { sealCredentials } from './seal.js';
import { WebSealedStore } from './stores/webSealedStore.js';
import {
  clearCloudCredentialsOnLock,
  loadLocalCloudCredentials,
  persistCloudCredentials,
  resolveCloudPersistMode,
  shouldRetainSealedCloudOnLock
} from './webCloudCredentialLifecycle.js';
import { getSessionCloudCredentials } from './sessionMemory.js';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';

const session = { sessionId: 's1', pnName: 'test-name', passcode: 'test-pass' };
const identityId = 'pn-test-identity';

const creds: StorageCredentialsEnvelope = {
  socialCloudProvider: 'google_drive',
  googleDriveAccounts: [{ accountId: 'a1', accessToken: 'tok', refreshToken: 'rt' }]
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: () => null
  };
}

describe('resolveCloudPersistMode', () => {
  it('seals when no keyed devices (Case A)', () => {
    expect(resolveCloudPersistMode({ hasKeyedDevices: false })).toBe('sealed');
  });
  it('session when keyed devices exist (Case B web)', () => {
    expect(resolveCloudPersistMode({ hasKeyedDevices: true })).toBe('session');
  });
  it('retain sealed on lock only in Case A', () => {
    expect(shouldRetainSealedCloudOnLock({ hasKeyedDevices: false })).toBe(true);
    expect(shouldRetainSealedCloudOnLock({ hasKeyedDevices: true })).toBe(false);
  });
});

describe('clearCloudCredentialsOnLock', () => {
  let store: WebSealedStore;

  beforeEach(() => {
    store = new WebSealedStore(memoryStorage());
  });

  it('wipes sealed + session when unkeyed (legacy isKeyedSession false)', async () => {
    await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'sealed',
      store
    });
    expect(await store.get(identityId)).not.toBeNull();
    expect(getSessionCloudCredentials(identityId)).not.toBeNull();

    await clearCloudCredentialsOnLock({ identityId, isKeyedSession: false, store });
    expect(await store.get(identityId)).toBeNull();
    expect(getSessionCloudCredentials(identityId)).toBeNull();
  });

  it('keeps sealed store when keyed and only clears session memory', async () => {
    await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'sealed',
      store
    });
    await clearCloudCredentialsOnLock({ identityId, isKeyedSession: true, store });
    expect(getSessionCloudCredentials(identityId)).toBeNull();
    expect(await store.get(identityId)).not.toBeNull();

    const restored = await loadLocalCloudCredentials({ identityId, session, store });
    expect(restored?.googleDriveAccounts?.[0]?.accessToken).toBe('tok');
  });

  it('Case A: retains sealed when hasKeyedDevices false', async () => {
    await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'sealed',
      store
    });
    await clearCloudCredentialsOnLock({
      identityId,
      isKeyedSession: false,
      hasKeyedDevices: false,
      store
    });
    expect(getSessionCloudCredentials(identityId)).toBeNull();
    expect(await store.get(identityId)).not.toBeNull();
  });

  it('Case B: wipes sealed when hasKeyedDevices true and unkeyed', async () => {
    await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'sealed',
      store
    });
    await clearCloudCredentialsOnLock({
      identityId,
      isKeyedSession: false,
      hasKeyedDevices: true,
      store
    });
    expect(await store.get(identityId)).toBeNull();
  });

  it('session mode never writes sealed store', async () => {
    const sealed = await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'session',
      store
    });
    expect(sealed).toBeNull();
    expect(await store.get(identityId)).toBeNull();
    expect(getSessionCloudCredentials(identityId)?.googleDriveAccounts?.[0]?.accessToken).toBe('tok');
  });

  it('durable sealed has no expiresAt', async () => {
    const sealed = await persistCloudCredentials({
      identityId,
      credentials: creds,
      session,
      mode: 'sealed',
      store
    });
    expect(sealed?.expiresAt ?? null).toBeNull();
  });
});

describe('seal round-trip sanity', () => {
  it('seals with session', async () => {
    const env = await sealCredentials(creds, session, null);
    expect(env.encryptedData).toBeTruthy();
  });
});
