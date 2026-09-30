/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = new Map<string, { googleDriveAccounts?: Array<{ access_token?: string }> }>();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  getSessionCloudCredentials: (id: string) => session.get(id) ?? null,
  hydrateCloudCredentialsFromVault: vi.fn(async (opts: { pnIdentifier: string }) => {
    session.set(opts.pnIdentifier, {
      googleDriveAccounts: [{ access_token: 'ya29-from-vault' }],
    });
    return { status: 'ready' as const };
  }),
}));

vi.mock('@par-noir/user-owned-storage', () => ({
  envelopeHasUsableSecrets: (env: { googleDriveAccounts?: unknown[] } | null) =>
    Boolean(env?.googleDriveAccounts?.length),
}));

import { hydrateCloudCredentialsFromVault } from '@par-noir/device-cloud-credentials';
import { ensureCloudCredentialsReady } from './cloudVaultHydrate';

describe('ensureCloudCredentialsReady', () => {
  beforeEach(() => {
    session.clear();
    vi.mocked(hydrateCloudCredentialsFromVault).mockClear();
  });

  it('opens the sealed vault with the unlock ML-KEM secret and no passcode', async () => {
    const status = await ensureCloudCredentialsReady({
      apiEndpoint: 'https://api.parnoir.com',
      authToken: 'owner-jwt',
      pnIdentifier: 'pn-abc',
      mlKemSecretKey: 'mlkem-secret',
    });

    expect(status).toBe('ready');
    expect(hydrateCloudCredentialsFromVault).toHaveBeenCalledWith(
      expect.objectContaining({
        pnIdentifier: 'pn-abc',
        mlKemSecretKey: 'mlkem-secret',
      })
    );
    expect(session.get('pn-abc')?.googleDriveAccounts?.[0]?.access_token).toBe('ya29-from-vault');
  });
});
