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

process.env.STORAGE_CREDENTIALS_SECRET =
  process.env.STORAGE_CREDENTIALS_SECRET || 'test-storage-credentials-secret-for-custody';

import {
  credentialsContainCloudSecrets,
  storageCredentialsService,
} from '../storageCredentialsService';


describe('device custody — no server-held cloud secrets', () => {
  beforeEach(() => {
    mockQuery.mockReset();
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

  describe('upsertCredentials', () => {
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
});
