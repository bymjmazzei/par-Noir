/**
 * @jest-environment jsdom
 *
 * Disconnect publishes an empty Drive vault before it clears the local token.
 * A failed vault write leaves the session token in place.
 */
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import {
  clearAllSessionCloudCredentials,
  getSessionCloudCredentials,
  setSessionCloudCredentials,
} from '@par-noir/device-cloud-credentials';
import {
  cloudDisconnectGeneration,
  commitGoogleDriveDisconnect,
} from './disconnectCloud';

const session = new Map<string, StorageCredentialsEnvelope>();

jest.mock('@par-noir/device-cloud-credentials', () => ({
  normalizeCloudIdentityId: (id: string) => (id.startsWith('pn-') ? id : `pn-${id}`),
  getSessionCloudCredentials: (id: string) => session.get(id.startsWith('pn-') ? id : `pn-${id}`) ?? null,
  setSessionCloudCredentials: (id: string, env: StorageCredentialsEnvelope) => {
    session.set(id.startsWith('pn-') ? id : `pn-${id}`, env);
  },
  clearSessionCloudCredentials: (id: string) => {
    session.delete(id.startsWith('pn-') ? id : `pn-${id}`);
  },
  clearAllSessionCloudCredentials: () => {
    session.clear();
  },
  loadLocalCloudCredentials: async () => null,
  wipeSealedCloudCredentials: async () => undefined,
}));

jest.mock('@par-noir/user-owned-storage', () => ({
  envelopeHasUsableSecrets: (env: StorageCredentialsEnvelope | null | undefined) =>
    (env?.googleDriveAccounts ?? []).some(
      (account) =>
        Boolean(account.accessToken || account.access_token || account.refreshToken || account.refresh_token)
    ),
}));

const PN = 'pn-disconnect-test';

const linked: StorageCredentialsEnvelope = {
  socialCloudProvider: 'google_drive',
  socialCloudAccountId: 'google_drive::acct',
  googleDriveAccounts: [
    {
      backendId: 'google_drive::acct',
      accountId: 'google_drive::acct',
      accessToken: 'ya29-live',
      refreshToken: 'refresh-live',
    },
  ],
};

beforeEach(() => {
  clearAllSessionCloudCredentials();
  setSessionCloudCredentials(PN, linked);
});

afterEach(() => {
  clearAllSessionCloudCredentials();
});

test('vault PUT failure leaves the session token and does not clear the seal', async () => {
  const seen = cloudDisconnectGeneration(PN);
  let sealedCleared = false;
  const putLayout = jest.fn(async () => ({ ok: true }));

  await expect(
    commitGoogleDriveDisconnect({
      pnIdentifier: PN,
      backendId: 'google_drive::acct',
      current: linked,
      publishVault: async () => ({ ok: false, error: 'vault down' }),
      putLayout,
      clearSealed: async () => {
        sealedCleared = true;
      },
    })
  ).rejects.toThrow('vault down');

  expect(putLayout).not.toHaveBeenCalled();
  expect(sealedCleared).toBe(false);
  expect(cloudDisconnectGeneration(PN)).toBe(seen);
  expect(getSessionCloudCredentials(PN)?.googleDriveAccounts?.[0]?.accessToken).toBe('ya29-live');
  expect(envelopeHasUsableSecrets(getSessionCloudCredentials(PN))).toBe(true);
});

test('successful disconnect clears the seal and hydrates with no Google token', async () => {
  let published: StorageCredentialsEnvelope | null = null;
  let sealedCleared = false;
  let layout: Record<string, unknown> | null = null;

  const remaining = await commitGoogleDriveDisconnect({
    pnIdentifier: PN,
    backendId: 'google_drive::acct',
    current: getSessionCloudCredentials(PN),
    publishVault: async (credentials) => {
      published = credentials;
      return { ok: true };
    },
    putLayout: async (credentials) => {
      layout = credentials;
      return { ok: true };
    },
    clearSealed: async () => {
      sealedCleared = true;
    },
  });

  expect(sealedCleared).toBe(true);
  expect(getSessionCloudCredentials(PN)).toBeNull();
  expect(layout).toMatchObject({
    googleDriveAccounts: [],
    pnDriveIndex: null,
    driveFolderId: null,
  });
  expect(envelopeHasUsableSecrets(published)).toBe(false);
  expect(envelopeHasUsableSecrets(remaining)).toBe(false);

  setSessionCloudCredentials(PN, published!);
  expect(envelopeHasUsableSecrets(getSessionCloudCredentials(PN))).toBe(false);
  expect(cloudDisconnectGeneration(PN)).toBeGreaterThan(0);
});
