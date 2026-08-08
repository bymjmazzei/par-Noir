import type { Request } from 'express';
import {
  buildOAuthIdentityCandidates,
  getExistingGrant,
} from '../modules/oauthDrivePermissionContext';
import { PN_DRIVE_SHEET_KEYS } from '../modules/pnDriveIndex';

/** Owner device forwards its Drive token; absent header means custody has nothing to use. */
function reqWithCloudToken(token?: string): Request {
  return {
    headers: token ? { 'x-pn-cloud-access-token': token } : {},
  } as unknown as Request;
}

jest.mock('../modules/storageCredentialsService', () => ({
  storageCredentialsService: {
    findCredentialsByIdentityCandidates: jest.fn(),
  },
}));

jest.mock('../modules/googleDriveProxy', () => ({
  googleDriveProxyService: {
    getAccessToken: jest.fn(),
  },
}));

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
  },
}));

jest.mock('../modules/storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn().mockResolvedValue(false),
}));

/**
 * Mock the Redis primitives, not oauthPermissionCache itself. The previous suite
 * mocked the cache module to resolve `undefined` — a value the real function
 * cannot return — which is exactly why it passed while production short-circuited.
 */
jest.mock('../utils/cache', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCache: jest.fn().mockResolvedValue(undefined),
}));

import { storageCredentialsService } from '../modules/storageCredentialsService';
import { googleDriveProxyService } from '../modules/googleDriveProxy';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';
import { isPortableStorageProvider } from '../modules/storage/storageProviderUtils';
import { getCache, setCache } from '../utils/cache';

const mockFindCreds = storageCredentialsService.findCredentialsByIdentityCandidates as jest.Mock;
const mockGetToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.Mock;
const mockIsPortable = isPortableStorageProvider as jest.Mock;
const mockGetCache = getCache as jest.Mock;
const mockSetCache = setCache as jest.Mock;

const PN = 'pn-59e4692524b7';

function testPnDriveIndex() {
  const sheetIds = Object.fromEntries(
    Object.values(PN_DRIVE_SHEET_KEYS).map((k) => [k, `sheet-${k}`])
  );
  return {
    schemaVersion: 1,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox',
    sheetIds,
    conversationSheets: {},
  };
}

function driveCredentials() {
  return {
    identityId: PN,
    credentials: {
      googleDrive: { access_token: 'tok' },
      pnDriveIndex: testPnDriveIndex(),
    },
  };
}

describe('getExistingGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue(null);
    mockIsPortable.mockResolvedValue(false);
    mockGetToken.mockResolvedValue('drive-access-token');
  });

  it('reads Drive when the cache misses, instead of treating a miss as "no grant"', async () => {
    mockFindCreds.mockResolvedValue(driveCredentials());
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: ['over_21'],
        optionalDataPoints: ['over_21'],
      },
    });

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN });

    expect(mockGetPermissions).toHaveBeenCalled();
    expect(result).toEqual({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });
    expect(mockSetCache).toHaveBeenCalledWith(
      `oauth:grant:browser-app:${PN}`,
      { dataPoints: ['over_21'], consideredDataPoints: ['over_21'] },
      expect.any(Number)
    );
  });

  it('serves a cached hint without hitting Drive', async () => {
    mockGetCache.mockResolvedValue({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN });

    expect(result).toEqual({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });
    expect(mockFindCreds).not.toHaveBeenCalled();
    expect(mockGetPermissions).not.toHaveBeenCalled();
  });

  it('keys the cache per client so browse and messaging do not share a grant', async () => {
    mockFindCreds.mockResolvedValue(driveCredentials());
    mockGetPermissions.mockResolvedValue({
      'messaging-app': { toolId: 'messaging-app', status: 'active', dataPoints: [] },
    });

    await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'messaging-app', { pnIdentifier: PN });

    expect(mockGetCache).toHaveBeenCalledWith(`oauth:grant:messaging-app:${PN}`);
  });

  it('remembers a declined data point rather than re-prompting', async () => {
    mockFindCreds.mockResolvedValue(driveCredentials());
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: [],
        optionalDataPoints: ['over_21'],
      },
    });

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN });

    expect(result).toEqual({ dataPoints: [], consideredDataPoints: ['over_21'] });
  });

  it('returns null for a revoked grant and does not cache it', async () => {
    mockFindCreds.mockResolvedValue(driveCredentials());
    mockGetPermissions.mockResolvedValue({
      'browser-app': { toolId: 'browser-app', status: 'revoked', dataPoints: [] },
    });

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN });

    expect(result).toBeNull();
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('returns null when the client has no grant row', async () => {
    mockFindCreds.mockResolvedValue(driveCredentials());
    mockGetPermissions.mockResolvedValue({});

    expect(await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN })).toBeNull();
  });

  it('returns null when credentials cannot be resolved', async () => {
    mockFindCreds.mockResolvedValue(null);

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', {
      pnIdentifier: PN,
      did: 'did:key:abc',
    });

    expect(result).toBeNull();
  });

  it('reads portable social cloud without a Drive index', async () => {
    mockIsPortable.mockResolvedValue(true);
    mockFindCreds.mockResolvedValue({
      identityId: PN,
      credentials: { socialCloudProvider: 'dropbox' },
    });
    mockGetPermissions.mockResolvedValue({
      'browser-app': { toolId: 'browser-app', status: 'active', dataPoints: ['over_21'] },
    });

    const result = await getExistingGrant(reqWithCloudToken('forwarded-tok'), 'browser-app', { pnIdentifier: PN });

    expect(result).toEqual({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockGetPermissions).toHaveBeenCalledWith('', '', PN);
  });
});

/**
 * Regression for the bug that disabled third-party grants for weeks.
 *
 * Production stores account shells: stripCloudSecrets removes access_token and
 * refresh_token. The old code saw the empty token, checked custody, and returned
 * null without ever reading Drive. Every existing fixture above hid it by keeping
 * access_token on the row, which is not what production stores.
 */
describe('device cloud custody (stored row has no secrets)', () => {
  /** What the API actually persists once stripCloudSecrets has run. */
  function strippedCustodyCredentials() {
    return {
      identityId: PN,
      credentials: {
        googleDriveAccounts: [{ backendId: 'google-drive-1', accountId: 'google-drive-1' }],
        pnDriveIndex: testPnDriveIndex(),
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEVICE_CLOUD_CUSTODY; // default: custody enabled
    mockGetCache.mockResolvedValue(null);
    mockIsPortable.mockResolvedValue(false);
    mockFindCreds.mockResolvedValue(strippedCustodyCredentials());
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: ['over_21'],
        optionalDataPoints: ['over_21'],
      },
    });
  });

  it('reads the grant using the forwarded cloud token', async () => {
    const result = await getExistingGrant(reqWithCloudToken('device-tok'), 'browser-app', {
      pnIdentifier: PN,
    });

    expect(result).toEqual({ dataPoints: ['over_21'], consideredDataPoints: ['over_21'] });
    // The forwarded token is what reaches Drive, not a server-held secret.
    expect(mockGetPermissions).toHaveBeenCalledWith(
      'device-tok',
      expect.any(String),
      PN,
      expect.anything(),
      expect.any(String)
    );
    // The server must never fall back to its own proxy under custody.
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('returns null without reading Drive when no token is forwarded', async () => {
    mockGetToken.mockRejectedValue(new Error('no server-held secrets under custody'));

    const result = await getExistingGrant(reqWithCloudToken(), 'browser-app', {
      pnIdentifier: PN,
    });

    expect(result).toBeNull();
    expect(mockGetPermissions).not.toHaveBeenCalled();
  });
});

describe('buildOAuthIdentityCandidates', () => {
  it('returns empty candidates for missing inputs', () => {
    expect(buildOAuthIdentityCandidates({})).toEqual([]);
  });

  it('includes normalized pn and did', () => {
    const candidates = buildOAuthIdentityCandidates({
      pnIdentifier: '59e4692524b7',
      did: 'did:key:z6MkhaXgBZDv7H7urywpFfP3xwT7L1BDAXv9C5UyqftV19jG',
    });
    expect(candidates).toContain('pn-59e4692524b7');
    expect(candidates).toContain('did:key:z6MkhaXgBZDv7H7urywpFfP3xwT7L1BDAXv9C5UyqftV19jG');
  });
});
