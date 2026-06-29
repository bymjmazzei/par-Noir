import {
  buildOAuthIdentityCandidates,
  getBrowserAppExistingPermissions,
} from '../modules/oauthDrivePermissionContext';

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

jest.mock('../modules/integratorFolderService', () => ({
  lookupPnFolderLayout: jest.fn(),
}));

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
  },
}));

import { storageCredentialsService } from '../modules/storageCredentialsService';
import { googleDriveProxyService } from '../modules/googleDriveProxy';
import { lookupPnFolderLayout } from '../modules/integratorFolderService';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';

const mockFindCreds = storageCredentialsService.findCredentialsByIdentityCandidates as jest.Mock;
const mockGetToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockLayout = lookupPnFolderLayout as jest.Mock;
const mockGetPerms = ThirdPartyPermissionsService.getPermissions as jest.Mock;

describe('oauthDrivePermissionContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing permissions when credentials resolve via DID candidate', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: 'did:key:abc',
      credentials: { googleDriveAccounts: [{ backendId: 'acc-1', access_token: 'tok' }] },
    });
    mockGetToken.mockResolvedValue('drive-access-token');
    mockLayout.mockResolvedValue({ pnFolderId: 'pn-folder', metadataFolderId: 'meta-folder' });
    mockGetPerms.mockResolvedValue({
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
    expect(mockFindCreds).toHaveBeenCalledWith(
      expect.arrayContaining(['pn-59e4692524b7', 'did:key:abc'])
    );
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
      credentials: { googleDrive: { access_token: 'tok' } },
    });
    mockGetToken.mockResolvedValue('drive-access-token');
    mockLayout.mockResolvedValue({ pnFolderId: 'pn-folder', metadataFolderId: 'meta-folder' });
    mockGetPerms.mockResolvedValue({});

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
