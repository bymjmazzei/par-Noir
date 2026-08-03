import { describe, expect, it, beforeEach } from 'vitest';
import { sealCredentials } from './seal.js';
import { WebSealedStore } from './stores/webSealedStore.js';
import {
  clearCloudCredentialsOnLock,
  loadLocalCloudCredentials,
  persistCloudCredentials
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

describe('clearCloudCredentialsOnLock', () => {
  let store: WebSealedStore;

  beforeEach(() => {
    store = new WebSealedStore(memoryStorage());
  });

  it('wipes sealed + session when unkeyed', async () => {
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
});

describe('seal round-trip sanity', () => {
  it('seals with session', async () => {
    const env = await sealCredentials(creds, session, null);
    expect(env.encryptedData).toBeTruthy();
  });
});
