/**
 * Gate: incomplete pnDriveIndex + forwarded cloud AT → ensureCompletePnDriveIndex
 * → resolveOAuthDriveContext returns non-null.
 *
 * Falsifier: if ensure is never called (or context stays null after ensure), this fails.
 */

import type { Request } from 'express';
import { PN_DRIVE_SHEET_KEYS } from '../modules/pnDriveIndex';

function reqWithCloudToken(token?: string): Request {
  return {
    headers: token ? { 'x-pn-cloud-access-token': token } : {},
  } as unknown as Request;
}

const ensureMock = jest.fn();

jest.mock('../modules/storageCredentialsService', () => ({
  storageCredentialsService: {
    findCredentialsByIdentityCandidates: jest.fn(),
    getCredentials: jest.fn(),
  },
}));

jest.mock('../modules/driveInitSteps', () => ({
  ensureCompletePnDriveIndex: (...args: unknown[]) => ensureMock(...args),
}));

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
  },
}));

jest.mock('../modules/storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn().mockResolvedValue(false),
}));

jest.mock('../utils/cache', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCache: jest.fn().mockResolvedValue(undefined),
}));

import { storageCredentialsService } from '../modules/storageCredentialsService';
import {
  resolveOAuthDriveContext,
  resolveOAuthDriveContextDetailed,
} from '../modules/oauthDrivePermissionContext';

const mockFindCreds = storageCredentialsService.findCredentialsByIdentityCandidates as jest.Mock;
const mockGetCreds = storageCredentialsService.getCredentials as jest.Mock;

const PN = 'pn-59e4692524b7';

function completeIndex() {
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

describe('resolveOAuthDriveContext ensureCompletePnDriveIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEVICE_CLOUD_CUSTODY;
    ensureMock.mockResolvedValue({
      metadataFolderId: 'meta-folder',
      pnFolderId: 'pn-folder',
    });
  });

  it('bootstraps incomplete index with forwarded AT then returns context', async () => {
    const incompleteCreds = {
      identityId: PN,
      credentials: {
        googleDriveAccounts: [{ backendId: 'google-drive-1', accountId: 'google-drive-1' }],
        // missing pnDriveIndex → incomplete
      },
    };
    mockFindCreds.mockResolvedValue(incompleteCreds);
    mockGetCreds.mockResolvedValue({
      identityId: PN,
      credentials: {
        googleDriveAccounts: [{ backendId: 'google-drive-1', accountId: 'google-drive-1' }],
        pnDriveIndex: completeIndex(),
      },
    });

    const ctx = await resolveOAuthDriveContext(reqWithCloudToken('device-tok'), {
      pnIdentifier: PN,
    });

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pnIdentifier: PN,
        token: { access_token: 'device-tok' },
      })
    );
    expect(ctx).not.toBeNull();
    expect(ctx?.userAccessToken).toBe('device-tok');
    expect(ctx?.metadataFolderId).toBe('meta-folder');
  });

  it('returns drive_index_incomplete when ensure fails', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: PN,
      credentials: {
        googleDriveAccounts: [{ backendId: 'g1' }],
      },
    });
    ensureMock.mockRejectedValue(new Error('init failed'));

    const result = await resolveOAuthDriveContextDetailed(reqWithCloudToken('device-tok'), {
      pnIdentifier: PN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('drive_index_incomplete');
    }
  });

  it('returns cloud_token_required when no token is forwarded', async () => {
    mockFindCreds.mockResolvedValue({
      identityId: PN,
      credentials: {
        googleDriveAccounts: [{ backendId: 'g1' }],
        pnDriveIndex: completeIndex(),
      },
    });

    const result = await resolveOAuthDriveContextDetailed(reqWithCloudToken(), {
      pnIdentifier: PN,
    });

    expect(ensureMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('cloud_token_required');
    }
  });
});
