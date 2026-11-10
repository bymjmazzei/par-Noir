const runDeviceCloudLayoutMigration = jest.fn();
const getCloudAccessTokenFromSession = jest.fn();
const sessionDriveFor = jest.fn();
const ownerFetch = jest.fn();

jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.test' }));

jest.mock('../services/deviceProofContext', () => ({
  deviceProofHeaders: jest.fn(async () => ({})),
}));

const resolveTablesSocialContext = jest.fn();
const normalizeInboxKeysOnTables = jest.fn();

jest.mock('@par-noir/device-cloud-credentials', () => ({
  MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1: 'inbox_channel_client_id_v1',
  getCloudAccessTokenFromSession: (...args: unknown[]) => getCloudAccessTokenFromSession(...args),
  runDeviceCloudLayoutMigration: (...args: unknown[]) => runDeviceCloudLayoutMigration(...args),
  resolveTablesSocialContext: (...args: unknown[]) => resolveTablesSocialContext(...args),
  normalizeInboxKeysOnTables: (...args: unknown[]) => normalizeInboxKeysOnTables(...args),
}));

jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: (...args: unknown[]) => sessionDriveFor(...args),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

import { upgradeCloudLayout } from '../services/cloudLayoutService';

describe('upgradeCloudLayout', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    getCloudAccessTokenFromSession.mockReturnValue('google-tok');
    resolveTablesSocialContext.mockResolvedValue(null);
    normalizeInboxKeysOnTables.mockResolvedValue(1);
    sessionDriveFor.mockResolvedValue({
      accessToken: 'google-tok',
      index: { pnFolderId: 'root', inboxSheetId: 'inbox' },
    });
    runDeviceCloudLayoutMigration.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        complete: false,
        pending: [{ id: 'inbox_channel_client_id_v1', description: 'inbox' }],
        current: 0,
        required: 2,
        appliedMigrations: [],
      }),
    });
    ownerFetch.mockImplementation(async (_t: string, method: string, path: string, body?: unknown) => {
      if (method === 'POST' && path.includes('/layout/commit-migration')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: 'Not Found' }),
        };
      }
      if (method === 'POST' && path.includes('/storage/initialize/')) {
        const payload = body as { layoutMigrationCommit?: string };
        if (payload?.layoutMigrationCommit) {
          return {
            ok: true,
            json: async () => ({
              complete: true,
              pending: [],
              current: 2,
              required: 2,
              appliedMigrations: ['inbox_channel_client_id_v1'],
            }),
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false, json: async () => ({}) };
    });
  });

  it('falls back to initialize layoutMigrationCommit when commit-migration is 404', async () => {
    const result = await upgradeCloudLayout('auth', 'pn-abc');

    expect(runDeviceCloudLayoutMigration).toHaveBeenCalledTimes(1);
    expect(ownerFetch).toHaveBeenCalledWith(
      'auth',
      'POST',
      '/api/storage/initialize/pn-abc',
      { layoutMigrationCommit: 'inbox_channel_client_id_v1' },
      { pnIdentifier: 'pn-abc' }
    );
    expect(result.complete).toBe(true);
  });

  it('portable social clouds rewrite the inbox on the device and commit without Drive', async () => {
    const tables = { kind: 'tables', provider: 'aws_s3' };
    resolveTablesSocialContext.mockResolvedValue(tables);
    getCloudAccessTokenFromSession.mockReturnValue(undefined);

    const result = await upgradeCloudLayout('auth', 'pn-abc');

    expect(normalizeInboxKeysOnTables).toHaveBeenCalledWith(tables);
    expect(runDeviceCloudLayoutMigration).not.toHaveBeenCalled();
    expect(sessionDriveFor).not.toHaveBeenCalled();
    expect(result.complete).toBe(true);
  });
});
