import { describe, expect, it, vi } from 'vitest';
import { createDeviceSessionVault, memoryKv } from './adapters.js';
import type { DashboardKeysPayload, UnlockKeysPayload } from './types.js';

describe('DeviceSessionVault', () => {
  const payload: DashboardKeysPayload = {
    kind: 'dashboard_keys',
    identityId: 'id-1',
    publicKey: 'pk-1',
    pnName: 'KeyOneSecret!',
    passcode: 'KeyTwoSecret!',
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
      pnName: 'KeyOneA!',
      passcode: 'KeyTwoA!',
      encryptedIdentityJson: '{"encryptedData":"a"}',
      nickname: 'Alpha',
    };
    const b: UnlockKeysPayload = {
      kind: 'unlock_keys',
      identityId: 'did:b',
      publicKey: 'pk-cccccccddddd',
      pnName: 'KeyOneB!',
      passcode: 'KeyTwoB!',
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
      expect(unlocked.entries.find((e) => e.identityId === 'did:a')?.pnName).toBe('KeyOneA!');
      expect(unlocked.entries.find((e) => e.identityId === 'did:b')?.encryptedIdentityJson).toContain(
        '"b"'
      );
    }
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
      pnName: 'LegacyKey1!',
      passcode: 'LegacyKey2!',
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
