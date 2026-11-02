import { describe, expect, it, vi } from 'vitest';
import { createDeviceSessionVault, memoryKv } from './adapters.js';
import { unlockIdentityLabel, type DashboardKeysPayload, type UnlockKeysPayload } from './types.js';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';

describe('unlockIdentityLabel', () => {
  it('uses the nickname, else the pN short label, never a public-key slice', () => {
    const publicKey = bytesToBase64(mlDsa65Keygen().publicKey);
    const pnId = deriveCanonicalPnIdentifier(publicKey);
    expect(unlockIdentityLabel({ identityId: 'x', publicKey, nickname: ' Work ' })).toBe('Work');
    expect(unlockIdentityLabel({ identityId: 'x', publicKey })).toBe(pnId.slice(0, 11));
    expect(unlockIdentityLabel({ identityId: pnId, publicKey: 'not-a-key' })).toBe(pnId.slice(0, 11));
    expect(unlockIdentityLabel({ identityId: 'legacy-id', publicKey: 'not-a-key' })).toBe('Saved pN');
  });
});

describe('DeviceSessionVault', () => {
  const payload: DashboardKeysPayload = {
    kind: 'dashboard_keys',
    identityId: 'id-1',
    publicKey: 'pk-1',
    key1: 'KeyOneSecret!',
    key2: 'KeyTwoSecret!',
  };

  it('enroll requires biometric verify', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
    });
    await expect(vault.enrollAfterUnlock('dashboard', payload)).rejects.toThrow(
      /Biometric verification required/
    );
    expect(verify).toHaveBeenCalled();
    expect(await vault.hasVault('dashboard')).toBe(false);
  });

  it('enroll then unlock returns payload', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
    });
    await vault.enrollAfterUnlock('dashboard', payload);
    expect(await vault.hasVault('dashboard')).toBe(true);
    const unlocked = await vault.unlockWithBiometric('dashboard');
    expect(unlocked).toEqual(payload);
    expect(verify.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('falsify: raw read without biometric does not count as unlock API', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
    });
    await vault.enrollAfterUnlock('dashboard', payload);
    verify.mockClear();
    // Internal raw read must not call biometric — proving unlockWithBiometric is the gated path
    const raw = await vault._readRawWithoutBiometric('dashboard');
    expect(raw).not.toBeNull();
    expect(verify).not.toHaveBeenCalled();
    // Public unlock must call biometric
    await vault.unlockWithBiometric('dashboard');
    expect(verify).toHaveBeenCalled();
  });

  it('unlock without biometric fails and increments; clears after max', async () => {
    let allow = true;
    const verify = vi.fn().mockImplementation(async () => {
      if (allow) return true;
      return false;
    });
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
      maxFailures: 2,
    });
    await vault.enrollAfterUnlock('dashboard', payload);
    allow = false;
    await expect(vault.unlockWithBiometric('dashboard')).rejects.toThrow(/failed/);
    await expect(vault.unlockWithBiometric('dashboard')).rejects.toThrow(/cleared/);
    expect(await vault.hasVault('dashboard')).toBe(false);
  });

  it('clearVault removes enrollment', async () => {
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: async () => true,
      isBiometricAvailable: async () => true,
    });
    await vault.enrollAfterUnlock('browse', {
      kind: 'browse_oauth',
      oauthSessionJson: '{"t":1}',
    });
    await vault.clearVault('browse');
    expect(await vault.hasVault('browse')).toBe(false);
    expect(await vault.unlockWithBiometric('browse')).toBeNull();
  });

  it('updateWhileUnlocked works after enroll without second biometric', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
    });
    await vault.enrollAfterUnlock('messaging', {
      kind: 'messaging_session',
      oauthSessionJson: '{"a":1}',
      dmSessionJson: null,
    });
    verify.mockClear();
    await vault.updateWhileUnlocked('messaging', {
      kind: 'messaging_session',
      oauthSessionJson: '{"a":1}',
      dmSessionJson: '{"mlKemSecretKey":"x"}',
    });
    expect(verify).not.toHaveBeenCalled();
    const unlocked = await vault.unlockWithBiometric('messaging');
    expect(unlocked?.kind).toBe('messaging_session');
    if (unlocked?.kind === 'messaging_session') {
      expect(unlocked.dmSessionJson).toContain('mlKemSecretKey');
    }
  });

  it('app ids are namespaced separately', async () => {
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: async () => true,
      isBiometricAvailable: async () => true,
    });
    await vault.enrollAfterUnlock('browse', {
      kind: 'browse_oauth',
      oauthSessionJson: '{"browse":true}',
    });
    await vault.enrollAfterUnlock('messaging', {
      kind: 'messaging_session',
      oauthSessionJson: '{"msg":true}',
      dmSessionJson: '{"dm":true}',
    });
    const b = await vault.unlockWithBiometric('browse');
    const m = await vault.unlockWithBiometric('messaging');
    expect(b?.kind).toBe('browse_oauth');
    expect(m?.kind).toBe('messaging_session');
  });

  it('unlock app merges multiple pNs behind one biometric', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const vault = createDeviceSessionVault({
      kv: memoryKv(),
      verifyBiometric: verify,
      isBiometricAvailable: async () => true,
    });
    const a: UnlockKeysPayload = {
      kind: 'unlock_keys',
      identityId: 'did:a',
      publicKey: 'pk-aaaaaaaabbbb',
      key1: 'KeyOneA!',
      key2: 'KeyTwoA!',
      encryptedIdentityJson: '{"encryptedData":"a"}',
      nickname: 'Alpha',
    };
    const b: UnlockKeysPayload = {
      kind: 'unlock_keys',
      identityId: 'did:b',
      publicKey: 'pk-cccccccddddd',
      key1: 'KeyOneB!',
      key2: 'KeyTwoB!',
      encryptedIdentityJson: '{"encryptedData":"b"}',
    };
    await vault.enrollAfterUnlock('unlock', a);
    expect(await vault.hasUnlockIdentity('did:a')).toBe(true);
    expect(await vault.hasUnlockIdentity('did:b')).toBe(false);
    await vault.enrollAfterUnlock('unlock', b);
    const index = await vault.listUnlockIndex();
    expect(index).toHaveLength(2);
    expect(index.map((i) => i.identityId).sort()).toEqual(['did:a', 'did:b']);

    const unlocked = await vault.unlockWithBiometric('unlock');
    expect(unlocked?.kind).toBe('unlock_multi');
    if (unlocked?.kind === 'unlock_multi') {
      expect(unlocked.entries).toHaveLength(2);
      expect(unlocked.entries.find((e) => e.identityId === 'did:a')?.key1).toBe('KeyOneA!');
      expect(unlocked.entries.find((e) => e.identityId === 'did:b')?.encryptedIdentityJson).toContain(
        '"b"'
      );
    }
  });

  describe('removeUnlockIdentity', () => {
    const entry = (id: string): UnlockKeysPayload => ({
      kind: 'unlock_keys',
      identityId: id,
      publicKey: `pk-${id}`,
      key1: `K1-${id}`,
      key2: `K2-${id}`,
      encryptedIdentityJson: `{"encryptedData":"${id}"}`,
    });

    it('removes one pN and keeps the others sealed', async () => {
      const verify = vi.fn().mockResolvedValue(true);
      const vault = createDeviceSessionVault({
        kv: memoryKv(),
        verifyBiometric: verify,
        isBiometricAvailable: async () => true,
      });
      await vault.enrollAfterUnlock('unlock', entry('did:a'));
      await vault.enrollAfterUnlock('unlock', entry('did:b'));
      verify.mockClear();
      await vault.removeUnlockIdentity('did:a');
      expect(verify).not.toHaveBeenCalled();
      expect((await vault.listUnlockIndex()).map((i) => i.identityId)).toEqual(['did:b']);
      const unlocked = await vault.unlockWithBiometric('unlock');
      expect(unlocked?.kind === 'unlock_multi' && unlocked.entries.map((e) => e.identityId)).toEqual(['did:b']);
    });

    it('removing the last pN clears the vault', async () => {
      const vault = createDeviceSessionVault({
        kv: memoryKv(),
        verifyBiometric: async () => true,
        isBiometricAvailable: async () => true,
      });
      await vault.enrollAfterUnlock('unlock', entry('did:a'));
      await vault.removeUnlockIdentity('did:a');
      expect(await vault.hasVault('unlock')).toBe(false);
      expect(await vault.listUnlockIndex()).toEqual([]);
    });

    it('a fresh process needs biometric before removing', async () => {
      const kv = memoryKv();
      const deps = { kv, verifyBiometric: async () => true, isBiometricAvailable: async () => true };
      await createDeviceSessionVault(deps).enrollAfterUnlock('unlock', entry('did:a'));
      await createDeviceSessionVault(deps).enrollAfterUnlock('unlock', entry('did:b'));
      const denied = vi.fn().mockResolvedValue(false);
      const fresh = createDeviceSessionVault({ ...deps, verifyBiometric: denied });
      await expect(fresh.removeUnlockIdentity('did:a')).rejects.toThrow(/Biometric verification required/);
      expect(denied).toHaveBeenCalled();
      expect(await fresh.listUnlockIndex()).toHaveLength(2);
    });
  });

  it('unlock migrates legacy single unlock_keys to unlock_multi', async () => {
    const kv = memoryKv();
    const vault = createDeviceSessionVault({
      kv,
      verifyBiometric: async () => true,
      isBiometricAvailable: async () => true,
    });
    // Simulate legacy by writing via enroll then manually... enroll already writes multi.
    // Write a single unlock_keys seal using update path: enroll unlock_keys always merges to multi.
    // Direct seal of unlock_keys for migration test:
    const { sealPayload } = await import('./seal.js');
    const { vaultStorageKey } = await import('./vault.js');
    const legacy: UnlockKeysPayload = {
      kind: 'unlock_keys',
      identityId: 'did:legacy',
      publicKey: 'pk-legacyxxxx',
      key1: 'LegacyKey1!',
      key2: 'LegacyKey2!',
      encryptedIdentityJson: '{"encryptedData":"leg"}',
    };
    const sealed = await sealPayload(legacy);
    await kv.set(
      vaultStorageKey('unlock'),
      JSON.stringify({
        v: 1,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        key: sealed.key,
        enrolledAt: new Date().toISOString(),
        failureCount: 0,
      })
    );
    const unlocked = await vault.unlockWithBiometric('unlock');
    expect(unlocked?.kind).toBe('unlock_multi');
    if (unlocked?.kind === 'unlock_multi') {
      expect(unlocked.entries).toHaveLength(1);
      expect(unlocked.entries[0].identityId).toBe('did:legacy');
    }
    expect(await vault.hasUnlockIdentity('did:legacy')).toBe(true);
  });
});
