import {
  buildOAuthIdentityCandidates,
  getBrowserAppExistingPermissions,
} from '../modules/oauthDrivePermissionContext';
import { PN_DRIVE_SHEET_KEYS } from '../modules/pnDriveIndex';

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

jest.mock('../modules/oauthPermissionCache', () => ({
  getCachedBrowserAppPermissions: jest.fn().mockResolvedValue(undefined),
  setCachedBrowserAppPermissions: jest.fn().mockResolvedValue(undefined),
}));

import { storageCredentialsService } from '../modules/storageCredentialsService';
import { googleDriveProxyService } from '../modules/googleDriveProxy';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';
import { isPortableStorageProvider } from '../modules/storage/storageProviderUtils';
import {
  getCachedBrowserAppPermissions,
  setCachedBrowserAppPermissions,
} from '../modules/oauthPermissionCache';

const mockFindCreds = storageCredentialsService.findCredentialsByIdentityCandidates as jest.Mock;
const mockGetToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.Mock;
const mockIsPortable = isPortableStorageProvider as jest.Mock;
const mockGetCached = getCachedBrowserAppPermissions as jest.Mock;
const mockSetCached = setCachedBrowserAppPermissions as jest.Mock;

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

describe('oauthDrivePermissionContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCached.mockResolvedValue(undefined);
    mockIsPortable.mockResolvedValue(false);
  });

  it('returns cached permissions without Drive lookup', async () => {
    mockGetCached.mockResolvedValue({ ageShared: true });

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
    });

    expect(result).toEqual({ ageShared: true });
    expect(mockFindCreds).not.toHaveBeenCalled();
    expect(mockGetPermissions).not.toHaveBeenCalled();
  });

  it('returns existing permissions when credentials resolve via DID candidate', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: 'did:key:abc',
      credentials: {
        googleDriveAccounts: [{ backendId: 'acc-1', access_token: 'tok' }],
        pnDriveIndex: testPnDriveIndex(),
      },
    });
    mockGetToken.mockResolvedValue('drive-access-token');
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: ['age_attestation'],
      },
    });

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
      did: 'did:key:abc',
    });

    expect(result).toEqual({ ageShared: true });
    expect(mockSetCached).toHaveBeenCalledWith('pn-59e4692524b7', { ageShared: true });
    expect(mockFindCreds).toHaveBeenCalledWith(
      expect.arrayContaining(['pn-59e4692524b7', 'did:key:abc'])
    );
  });

  it('returns existing permissions for portable social cloud without Drive index', async () => {
    mockIsPortable.mockResolvedValue(true);
    mockFindCreds.mockResolvedValue({
      identityId: 'pn-59e4692524b7',
      credentials: { socialCloudProvider: 'dropbox' },
    });
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: ['age_attestation'],
      },
    });

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
    });

    expect(result).toEqual({ ageShared: true });
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockGetPermissions).toHaveBeenCalledWith('', '', 'pn-59e4692524b7');
  });

  it('returns null when credentials cannot be resolved', async () => {
    mockFindCreds.mockResolvedValue(null);

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
      did: 'did:key:abc',
    });

    expect(result).toBeNull();
  });

  it('returns null when browser-app permission is missing', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: 'pn-59e4692524b7',
      credentials: {
        googleDrive: { access_token: 'tok' },
        pnDriveIndex: testPnDriveIndex(),
      },
    });
    mockGetToken.mockResolvedValue('drive-access-token');
    mockGetPermissions.mockResolvedValue({});

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
    });

    expect(result).toBeNull();
  });

  it('returns null when browser-app permission is revoked (non-active)', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: 'pn-59e4692524b7',
      credentials: {
        googleDrive: { access_token: 'tok' },
        pnDriveIndex: testPnDriveIndex(),
      },
    });
    mockGetToken.mockResolvedValue('drive-access-token');
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'revoked',
        dataPoints: [],
      },
    });

    const result = await getBrowserAppExistingPermissions({
      pnIdentifier: 'pn-59e4692524b7',
    });

    expect(result).toBeNull();
  });

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
