import { describe, expect, it } from 'vitest';
import {
  canonicalCloudSealSession,
  sealCloudVault,
  unsealCloudVault,
  isSealedEnvelopeShape,
  looksLikePlaintextCloudSecrets,
  CLOUD_VAULT_SEAL_SESSION_ID
} from './cloudVault.js';

describe('cloud vault canonical seal', () => {
  it('uses fixed session id across apps', () => {
    const s = canonicalCloudSealSession('alice', 'secret');
    expect(s.sessionId).toBe(CLOUD_VAULT_SEAL_SESSION_ID);
    expect(s.pnName).toBe('alice');
  });

  it('round-trips with same factors regardless of former per-app sessionId', async () => {
    const creds = {
      googleDriveAccounts: [{ accountId: 'a1', accessToken: 'at', refreshToken: 'rt' }]
    };
    const sealed = await sealCloudVault(creds as any, 'alice', 'secret');
    expect(isSealedEnvelopeShape(sealed)).toBe(true);
    const opened = await unsealCloudVault(sealed, 'alice', 'secret');
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('rt');
  });

  it('fails unseal with wrong passcode', async () => {
    const sealed = await sealCloudVault(
      { googleDriveAccounts: [{ refreshToken: 'rt' }] } as any,
      'alice',
      'secret'
    );
    await expect(unsealCloudVault(sealed, 'alice', 'wrong')).rejects.toThrow();
  });

  it('detects plaintext oauth payloads', () => {
    expect(looksLikePlaintextCloudSecrets({ access_token: 'x', refresh_token: 'y' })).toBe(true);
    expect(
      looksLikePlaintextCloudSecrets({
        googleDriveAccounts: [{ accessToken: 'x' }]
      })
    ).toBe(true);
  });

  it('accepts sealed envelope shape', async () => {
    const sealed = await sealCloudVault({ ok: true } as any, 'a', 'b');
    expect(looksLikePlaintextCloudSecrets(sealed)).toBe(false);
    expect(isSealedEnvelopeShape(sealed)).toBe(true);
  });
});
