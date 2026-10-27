/**
 * Hermetic create → .pn JSON → unlock → ML-DSA OAuth unlock proof gate.
 * Uses ephemeral credentials (no .local/test-pn in CI).
 */
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  signOauthUnlockProof,
  verifyOauthUnlockProof,
} from '@par-noir/pqc-crypto';
import { buildRecoveryPayload } from '@par-noir/recovery-crypto';
import { IdentityCrypto } from './identityCrypto';
import { SecureCredentialManager } from './secureCredentialManager';

beforeAll(() => {
  // IdentityCrypto uses window.crypto.subtle; Node provides webcrypto on globalThis.
  Object.defineProperty(globalThis, 'window', {
    value: { crypto: webcrypto },
    configurable: true,
  });
});

afterEach(() => {
  SecureCredentialManager.clearAll();
});

describe('create → unlock → oauth unlock proof', () => {
  it('roundtrips dashboard .pn JSON and signs a verifiable unlock proof', async () => {
    const key1 = `test-pn-${Date.now()}`;
    const key2 = 'test-key2-not-a-secret';
    const nickname = 'Gate Test';

    const { identity } = await IdentityCrypto.createIdentity(key1, nickname, key2);

    // Same shape the dashboard downloads as .pn
    const pnFile = JSON.stringify({
      version: '1.0',
      identities: [identity],
    });
    const parsed = JSON.parse(pnFile) as { identities: typeof identity[] };
    const encryptedIdentity = parsed.identities[0];
    expect(encryptedIdentity.publicKey).toBeTruthy();
    expect(encryptedIdentity.encryptedData).toBeTruthy();

    const session = await IdentityCrypto.authenticateIdentity(
      encryptedIdentity,
      key2,
      key1
    );
    expect(session.id).toMatch(/^did:key:/);
    expect(session.publicKey).toBe(encryptedIdentity.publicKey);
    expect(session.accessToken.startsWith('pn-session.')).toBe(true);
    expect(SecureCredentialManager.hasCredentials(session.id)).toBe(true);

    const raw = await IdentityCrypto.decryptData(
      {
        encrypted: encryptedIdentity.encryptedData,
        iv: encryptedIdentity.iv,
        salt: encryptedIdentity.salt,
      },
      key1,
      key2
    );
    const decrypted = JSON.parse(raw) as {
      pqcSecrets?: { mlDsaSecretKey?: string };
    };
    const skB64 = decrypted.pqcSecrets?.mlDsaSecretKey;
    expect(skB64).toBeTruthy();

    const params = {
      challenge: 'hermetic-challenge-1',
      clientId: 'aggregator-browser',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      scope: 'openid profile',
      state: 'st',
      nonce: 'nn',
      publicKey: encryptedIdentity.publicKey,
    };
    const signature = signOauthUnlockProof(params, base64ToBytes(skB64!));
    expect(verifyOauthUnlockProof(signature, params, encryptedIdentity.publicKey)).toBe(true);
    expect(
      verifyOauthUnlockProof(signature, { ...params, challenge: 'tampered' }, encryptedIdentity.publicKey)
    ).toBe(false);
  }, 120_000);

  it('restoreIdentity keeps the pN keys and unlocks with the new keys only', async () => {
    const oldName = `test-pn-old-${Date.now()}`;
    const { identity: original } = await IdentityCrypto.createIdentity(oldName, 'Old', 'old-pass');
    const decrypted = JSON.parse(
      await IdentityCrypto.decryptData(
        { encrypted: original.encryptedData, iv: original.iv, salt: original.salt },
        oldName,
        'old-pass'
      )
    ) as { id: string; pqcSecrets: { mlDsaSecretKey: string; mlKemSecretKey: string } };
    const payload = buildRecoveryPayload({
      publicKey: original.publicKey,
      mlKemPublicKey: original.mlKemPublicKey!,
      mlKemSecretKey: decrypted.pqcSecrets.mlKemSecretKey,
      mlDsaSecretKey: decrypted.pqcSecrets.mlDsaSecretKey,
      identityId: decrypted.id,
      recoveryConfig: { threshold: 2, totalShares: 5, version: 1, createdAt: new Date().toISOString() },
    });

    const newName = `test-pn-new-${Date.now()}`;
    const { identity: restored } = await IdentityCrypto.restoreIdentity({
      payload,
      key1: newName,
      key2: 'new-pass',
    });

    expect(restored.publicKey).toBe(original.publicKey);
    expect(restored.mlKemPublicKey).toBe(original.mlKemPublicKey);
    expect(restored.recoveryEnvelope).toBeTruthy();
    expect(restored.recoveryEnvelope).not.toEqual(original.recoveryEnvelope);
    const session = await IdentityCrypto.authenticateIdentity(restored, 'new-pass', newName);
    expect(session.id).toBe(decrypted.id);
    await expect(IdentityCrypto.authenticateIdentity(restored, 'old-pass', oldName)).rejects.toThrow(
      /Authentication failed/
    );
  }, 120_000);

  it('never returns Key 1 as the session nickname', async () => {
    const key1 = `test-pn-secret-${Date.now()}`;
    for (const nickname of ['', key1]) {
      const { identity } = await IdentityCrypto.createIdentity(key1, nickname, 'pass');
      const session = await IdentityCrypto.authenticateIdentity(identity, 'pass', key1);
      expect(session.nickname).not.toBe(key1);
      expect(session.nickname).toMatch(/^pN [0-9a-f]{8}$/);
      const decrypted = JSON.parse(
        await IdentityCrypto.decryptData(
          { encrypted: identity.encryptedData, iv: identity.iv, salt: identity.salt },
          key1,
          'pass'
        )
      ) as { nickname: string; key1: string };
      expect(decrypted.nickname).toBe('');
      expect(decrypted.key1).toBe(key1);
      expect(decrypted).not.toHaveProperty('username');
      expect(decrypted).not.toHaveProperty('pnName');
    }
  }, 120_000);

  it('rejects unlock with wrong Key 2', async () => {
    const key1 = `test-pn-bad-${Date.now()}`;
    const { identity } = await IdentityCrypto.createIdentity(key1, 'x', 'correct-pass');
    await expect(
      IdentityCrypto.authenticateIdentity(identity, 'wrong-pass', key1)
    ).rejects.toThrow(/Authentication failed/);
  }, 120_000);
});
