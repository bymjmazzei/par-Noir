/**
 * @jest-environment node
 *
 * Gate tests: under device cloud custody the server must not persist or mint
 * long-lived cloud OAuth secrets for Google, Dropbox, or OneDrive.
 */

const mockQuery = jest.fn();

// storageCredentialsService imports: ../utils/database (server/utils), ../../utils/logger (src/utils)
jest.mock('../../utils/database', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

jest.mock('../../../utils/logger', () => ({
  hashIdentifier: (v?: string) => (v ? `hash:${v.slice(0, 8)}` : undefined),
  safeLogger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../socialMailboxService', () => ({
  isDeviceCloudCustodyEnabled: jest.fn(() => true),
}));

jest.mock('../googleDriveProxy', () => ({
  googleDriveProxyService: {
    getAccessToken: jest.fn(async () => 'should-not-be-called'),
  },
}));

process.env.STORAGE_CREDENTIALS_SECRET =
  process.env.STORAGE_CREDENTIALS_SECRET || 'test-storage-credentials-secret-for-custody';

import type { Request } from 'express';
import {
  credentialsContainCloudSecrets,
  storageCredentialsService,
} from '../storageCredentialsService';
import { resolveOwnerDriveToken } from '../ownerDriveToken';
import { isDeviceCloudCustodyEnabled } from '../socialMailboxService';
import { googleDriveProxyService } from '../googleDriveProxy';
import { dropboxProxyService } from './dropboxProxy';
import { onedriveProxyService } from './onedriveProxy';
import { createStorageRequestContext } from './storageRequestContext';
import { DriveIndexError } from '../pnDriveIndex';

const mockCustody = isDeviceCloudCustodyEnabled as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;

function reqWithCloudHeader(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers['x-pn-cloud-access-token'] = token;
  return { headers, header: (n: string) => headers[n.toLowerCase()] } as unknown as Request;
}

describe('device custody — no server-held cloud secrets', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCustody.mockReset().mockReturnValue(true);
    mockGetAccessToken.mockReset().mockResolvedValue('should-not-be-called');
  });

  describe('credentialsContainCloudSecrets / stripCloudSecrets', () => {
    it('detects Google, Dropbox, and OneDrive secrets', () => {
      expect(
        credentialsContainCloudSecrets({
          googleDriveAccounts: [{ backendId: 'g', refresh_token: 'rt-g' }],
        })
      ).toBe(true);
      expect(
        credentialsContainCloudSecrets({
          dropboxAccounts: [{ accountId: 'd', access_token: 'at-d' }],
        })
      ).toBe(true);
      expect(
        credentialsContainCloudSecrets({
          onedriveAccounts: [{ accountId: 'o', refresh_token: 'rt-o' }],
        })
      ).toBe(true);
      expect(
        credentialsContainCloudSecrets({
          googleDriveAccounts: [{ backendId: 'g' }],
          dropboxAccounts: [{ accountId: 'd' }],
        })
      ).toBe(false);
    });

    it('stripCloudSecrets removes secrets from all providers', () => {
      const stripped = storageCredentialsService.stripCloudSecrets({
        googleDriveAccounts: [
          { backendId: 'g', access_token: 'a', refresh_token: 'r', email: 'x@y.z' },
        ],
        dropboxAccounts: [{ accountId: 'd', access_token: 'da', refresh_token: 'dr' }],
        onedriveAccounts: [{ accountId: 'o', access_token: 'oa', refresh_token: 'or' }],
        socialCloudProvider: 'dropbox',
      });

      const g = (stripped.googleDriveAccounts as Record<string, unknown>[])[0];
      const d = (stripped.dropboxAccounts as Record<string, unknown>[])[0];
      const o = (stripped.onedriveAccounts as Record<string, unknown>[])[0];
      expect(g.access_token).toBeUndefined();
      expect(g.refresh_token).toBeUndefined();
      expect(g.backendId).toBe('g');
      expect(d.access_token).toBeUndefined();
      expect(d.refresh_token).toBeUndefined();
      expect(d.accountId).toBe('d');
      expect(o.access_token).toBeUndefined();
      expect(o.refresh_token).toBeUndefined();
      expect(stripped.socialCloudProvider).toBe('dropbox');
    });
  });

  describe('upsertCredentials under custody', () => {
    it('strips Google + Dropbox + OneDrive secrets before encrypt/persist', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            identity_id: 'pn-test',
            encrypted_metadata: '{}',
            cid: null,
            updated_at: new Date('2026-01-01T00:00:00.000Z'),
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });

      const record = await storageCredentialsService.upsertCredentials('pn-test', {
        googleDriveAccounts: [
          { backendId: 'g1', access_token: 'gat', refresh_token: 'grt' },
        ],
        dropboxAccounts: [{ accountId: 'd1', access_token: 'dat', refresh_token: 'drt' }],
        onedriveAccounts: [{ accountId: 'o1', access_token: 'oat', refresh_token: 'ort' }],
      });

      expect(record.credentials.googleDriveAccounts[0].access_token).toBeUndefined();
      expect(record.credentials.googleDriveAccounts[0].refresh_token).toBeUndefined();
      expect(record.credentials.dropboxAccounts[0].access_token).toBeUndefined();
      expect(record.credentials.dropboxAccounts[0].refresh_token).toBeUndefined();
      expect(record.credentials.onedriveAccounts[0].access_token).toBeUndefined();
      expect(record.credentials.onedriveAccounts[0].refresh_token).toBeUndefined();
      expect(record.credentials.googleDriveAccounts[0].backendId).toBe('g1');
      expect(JSON.stringify(record.credentials)).not.toMatch(
        /gat|grt|dat|drt|oat|ort/
      );
    });
  });

  describe('resolveOwnerDriveToken under custody', () => {
    it('throws CLOUD_TOKEN_REQUIRED with no header even when account has live secrets', async () => {
      await expect(
        resolveOwnerDriveToken(reqWithCloudHeader(), 'pn-test', {
          account: {
            backendId: 'acct',
            access_token: 'live-secret',
            refresh_token: 'rt',
            expires_at: Date.now() + 3_600_000,
          },
        })
      ).rejects.toMatchObject({ code: 'CLOUD_TOKEN_REQUIRED' });
      expect(mockGetAccessToken).not.toHaveBeenCalled();
    });

    it('returns the forwarded header token', async () => {
      const resolved = await resolveOwnerDriveToken(
        reqWithCloudHeader('forwarded-at'),
        'pn-test',
        {
          account: {
            backendId: 'acct',
            access_token: 'db-secret',
            refresh_token: 'rt',
            expires_at: Date.now() + 3_600_000,
          },
        }
      );
      expect(resolved.token.access_token).toBe('forwarded-at');
      expect(resolved.token.refresh_token).toBeUndefined();
      expect(mockGetAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('Dropbox / OneDrive proxies under custody', () => {
    it('Dropbox: no forwarded token throws; with token does not upsert', async () => {
      await expect(dropboxProxyService.getAccessToken('pn-test', 'acct')).rejects.toThrow(
        /Dropbox access token required/
      );
      await expect(
        dropboxProxyService.getAccessToken('pn-test', 'acct', 'fwd-dropbox')
      ).resolves.toBe('fwd-dropbox');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('OneDrive: no forwarded token throws; with token does not upsert', async () => {
      await expect(onedriveProxyService.getAccessToken('pn-test', 'acct')).rejects.toThrow(
        /OneDrive access token required/
      );
      await expect(
        onedriveProxyService.getAccessToken('pn-test', 'acct', 'fwd-onedrive')
      ).resolves.toBe('fwd-onedrive');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('createStorageRequestContext under custody', () => {
    it('does not resurrect DB access_token when header is missing', async () => {
      jest
        .spyOn(storageCredentialsService, 'getCredentials')
        .mockResolvedValue({
          identityId: 'pn-test',
          credentials: {
            googleDriveAccounts: [
              {
                backendId: 'acct',
                access_token: 'db-secret-should-not-leak',
                expires_at: Date.now() + 3_600_000,
              },
            ],
          },
          updatedAt: '',
          createdAt: '',
        });

      await expect(
        createStorageRequestContext(reqWithCloudHeader(), 'pn-test', 'acct')
      ).rejects.toBeInstanceOf(DriveIndexError);

      jest.restoreAllMocks();
    });

    it('uses forwarded header only', async () => {
      jest
        .spyOn(storageCredentialsService, 'getCredentials')
        .mockResolvedValue({
          identityId: 'pn-test',
          credentials: {
            googleDriveAccounts: [
              {
                backendId: 'acct',
                access_token: 'db-secret',
                expires_at: Date.now() + 3_600_000,
              },
            ],
          },
          updatedAt: '',
          createdAt: '',
        });

      const ctx = await createStorageRequestContext(
        reqWithCloudHeader('header-tok'),
        'pn-test',
        'acct'
      );
      expect(ctx?.accessToken).toBe('header-tok');
      expect(ctx?.driveToken?.access_token).toBe('header-tok');
      expect(ctx?.driveToken?.refresh_token).toBeUndefined();

      jest.restoreAllMocks();
    });
  });
});
