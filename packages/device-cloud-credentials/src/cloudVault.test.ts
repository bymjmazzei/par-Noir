import { describe, expect, it } from 'vitest';
import {
  canonicalCloudSealSession,
  sealCloudVault,
  sealCloudVaultWithMlKem,
  unsealCloudVault,
  unsealCloudVaultWithMlKem,
  unsealCloudVaultWithAnyFactor,
  isSealedEnvelopeShape,
  looksLikePlaintextCloudSecrets,
  CLOUD_VAULT_SEAL_SESSION_ID,
  CLOUD_VAULT_MLKEM_SESSION_ID,
  cloudVaultSealSessionFromMlKem
} from './cloudVault.js';

describe('cloud vault canonical seal', () => {
  it('uses fixed session id for identity seal', () => {
    const s = canonicalCloudSealSession('alice', 'secret');
    expect(s.sessionId).toBe(CLOUD_VAULT_SEAL_SESSION_ID);
  });

  it('mlkem seal is unsealable with mlkem only', async () => {
    const creds = {
      googleDriveAccounts: [{ accountId: 'a1', accessToken: 'at', refreshToken: 'rt' }]
    };
    const sealed = await sealCloudVaultWithMlKem(creds as any, 'kem-secret');
    expect(isSealedEnvelopeShape(sealed)).toBe(true);
    expect(cloudVaultSealSessionFromMlKem('kem-secret').sessionId).toBe(CLOUD_VAULT_MLKEM_SESSION_ID);
    const opened = await unsealCloudVaultWithMlKem(sealed, 'kem-secret');
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('rt');
  });

  it('any-factor prefers mlkem then falls back to identity', async () => {
    const sealed = await sealCloudVault(
      { googleDriveAccounts: [{ refreshToken: 'legacy-rt' }] } as any,
      'alice',
      'secret'
    );
    const opened = await unsealCloudVaultWithAnyFactor(sealed, {
      mlKemSecretKey: 'wrong',
      pnName: 'alice',
      passcode: 'secret'
    });
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('legacy-rt');
  });

  it('round-trips identity seal', async () => {
    const sealed = await sealCloudVault(
      { googleDriveAccounts: [{ refreshToken: 'rt' }] } as any,
      'alice',
      'secret'
    );
    const opened = await unsealCloudVault(sealed, 'alice', 'secret');
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('rt');
  });

  it('detects plaintext oauth payloads', () => {
    expect(looksLikePlaintextCloudSecrets({ access_token: 'x', refresh_token: 'y' })).toBe(true);
    expect(looksLikePlaintextCloudSecrets({ googleDriveAccounts: [{ accessToken: 'x' }] })).toBe(
      true
    );
  });
});
