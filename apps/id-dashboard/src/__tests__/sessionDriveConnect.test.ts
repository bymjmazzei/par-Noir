/**
 * @jest-environment jsdom
 *
 * Shell unlock has no Key 1 / Key 2. After Google returns a token, Drive setup
 * stays in this tab and uses the existing index.
 */
import {
  clearAllSessionCloudCredentials,
  getCloudAccessTokenFromSession,
} from '@par-noir/device-cloud-credentials';
import { connectDriveInThisSession } from '../services/sessionDriveConnect';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();
const mockSessionCreds = new Map<string, { googleDriveAccounts?: Array<{ accessToken?: string }> }>();

jest.mock('@par-noir/device-cloud-credentials', () => ({
  setSessionCloudCredentials: (id: string, creds: { googleDriveAccounts?: Array<{ accessToken?: string }> }) => {
    mockSessionCreds.set(id, creds);
  },
  getCloudAccessTokenFromSession: (id: string) =>
    mockSessionCreds.get(id)?.googleDriveAccounts?.[0]?.accessToken ?? null,
  clearAllSessionCloudCredentials: () => {
    mockSessionCreds.clear();
  },
  ensureSessionDriveIndex: async (args: {
    readStoredIndex?: () => Promise<{ inboxSheetId?: string; sheetIds?: { connections?: string } } | null>;
  }) => {
    const stored = await args.readStoredIndex?.();
    if (stored?.inboxSheetId && stored.sheetIds?.connections) return stored;
    throw new Error('would create a new par Noir folder');
  },
}));

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

const storedIndex = {
  schemaVersion: 1 as const,
  pnFolderId: 'folder',
  metadataFolderId: 'meta',
  integratorsRootId: 'integrators',
  messagesFolderId: 'messages',
  inboxSheetId: 'inbox',
  sheetIds: { connections: 'conn' },
  conversationSheets: {},
};

beforeEach(() => {
  ownerGet.mockReset();
  ownerFetch.mockReset();
  clearAllSessionCloudCredentials();
  ownerGet.mockResolvedValue({
    ok: true,
    json: async () => ({ credentials: { pnDriveIndex: storedIndex } }),
  });
});

test('finishes Drive connect in this tab when an index already exists', async () => {
  const before = window.location.href;
  await connectDriveInThisSession({
    identityId: 'pn-abc',
    authToken: 'owner-jwt',
    credentials: {
      socialCloudProvider: 'google_drive',
      socialCloudAccountId: 'acct',
      googleDriveAccounts: [
        {
          accountId: 'acct',
          accessToken: 'ya29-test',
          refreshToken: 'refresh',
          expires_at: Date.now() + 3_600_000,
        },
      ],
    },
  });

  expect(window.location.href).toBe(before);
  expect(getCloudAccessTokenFromSession('pn-abc')).toBe('ya29-test');
  expect(ownerGet).toHaveBeenCalled();
  expect(ownerFetch).not.toHaveBeenCalled();
});
