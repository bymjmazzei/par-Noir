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
    const pnName = `test-pn-${Date.now()}`;
    const passcode = 'test-passcode-not-a-secret';
    const nickname = 'Gate Test';

    const { identity } = await IdentityCrypto.createIdentity(pnName, nickname, passcode);

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
      passcode,
      pnName
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
      pnName,
      passcode
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

  it('rejects unlock with wrong passcode', async () => {
    const pnName = `test-pn-bad-${Date.now()}`;
    const { identity } = await IdentityCrypto.createIdentity(pnName, 'x', 'correct-pass');
    await expect(
      IdentityCrypto.authenticateIdentity(identity, 'wrong-pass', pnName)
    ).rejects.toThrow(/Authentication failed/);
  }, 120_000);
});
