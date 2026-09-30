/**
 * @jest-environment jsdom
 *
 * Shell unlock has no passcode. A Google token already in the device vault
 * must count as connected.
 */
import {
  clearCloudSessionBootstrap,
  ensureCloudSession,
} from '../services/storage/cloudSessionBootstrap';

const session = new Map<string, { googleDriveAccounts?: Array<{ accessToken?: string }> }>();
const ensureCloudCredentialsReady = jest.fn(async () => 'ready' as const);

jest.mock('@par-noir/identity-crypto', () => ({
  SecureCredentialManager: {
    getCredentials: () => null,
  },
}));

jest.mock('@par-noir/device-cloud-credentials', () => ({
  accountAccessToken: (acct: { accessToken?: string } | null | undefined) => acct?.accessToken ?? null,
  getSessionCloudCredentials: (id: string) => session.get(id) ?? null,
  hasCloudCredentialsReady: (id: string) => Boolean(session.get(id)?.googleDriveAccounts?.[0]?.accessToken),
  loadLocalCloudCredentials: async () => null,
  publishCloudDriveReady: async () => true,
}));

jest.mock('@par-noir/user-owned-storage', () => ({
  envelopeHasUsableSecrets: (env: { googleDriveAccounts?: unknown[] } | null) =>
    Boolean(env?.googleDriveAccounts?.length),
}));

jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.parnoir.com' }));

jest.mock('../services/aggregator/FileAggregatorService', () => ({
  getFileAggregatorService: () => ({ ensureInitialized: async () => undefined }),
}));

jest.mock('../services/storage/GoogleDriveBackend', () => ({
  GoogleDriveBackend: class GoogleDriveBackend {},
}));

jest.mock('../services/ownerApiService', () => ({
  ownerGet: jest.fn(),
}));

jest.mock('../services/deviceApiService', () => ({
  resolveLocalGoogleAccessTokenAsync: async (id: string) =>
    session.get(id)?.googleDriveAccounts?.[0]?.accessToken ?? null,
}));

jest.mock('../services/ownerApiToken', () => ({
  requireOwnerApiToken: () => 'api-token',
}));

jest.mock('../services/shellMlKem', () => ({
  readShellMlKem: (id: string) => (id === 'pn-abc' ? 'mlkem-secret' : null),
}));

jest.mock('@par-noir/oauth-ui', () => ({
  ensureCloudCredentialsReady: (...args: unknown[]) => ensureCloudCredentialsReady(...args),
}));

beforeEach(() => {
  session.clear();
  clearCloudSessionBootstrap();
  ensureCloudCredentialsReady.mockReset();
  ensureCloudCredentialsReady.mockResolvedValue('ready');
});

test('shell unlock with a session Google token is ready without a passcode', async () => {
  session.set('pn-abc', {
    googleDriveAccounts: [{ accessToken: 'ya29-test' }],
  });

  const result = await ensureCloudSession({
    apiToken: 'owner-jwt',
    pnIdentifier: 'pn-abc',
    sessionId: 'did-1',
  });

  expect(result.status).toBe('ready');
  expect(ensureCloudCredentialsReady).toHaveBeenCalledWith(
    expect.objectContaining({
      pnIdentifier: 'pn-abc',
      mlKemSecretKey: 'mlkem-secret',
      authToken: 'owner-jwt',
    })
  );
});

test('shell unlock with no vault still needs a Google reconnect', async () => {
  ensureCloudCredentialsReady.mockResolvedValue('missing');

  const result = await ensureCloudSession({
    apiToken: 'owner-jwt',
    pnIdentifier: 'pn-abc',
    sessionId: 'did-1',
  });

  expect(result.status).toBe('needs_reconnect');
});
