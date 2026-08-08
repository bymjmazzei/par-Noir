/**
 * @jest-environment node
 *
 * Custody unlock: layout shell without access token must not throw from
 * getOwnerStorageContext (device gates depend on soft null, not CLOUD_TOKEN_REQUIRED).
 */
import { DriveIndexError } from '../pnDriveIndex';
import { PN_DRIVE_SHEET_KEYS, REQUIRED_PN_DRIVE_SHEET_KEYS } from '../pnDriveIndex';
import { storageCredentialsService } from '../storageCredentialsService';
import { isPortableStorageProvider } from './storageProviderUtils';
import { getOwnerStorageContext, hasOwnerStorage } from './ownerStorageContext';

jest.mock('../storageCredentialsService', () => ({
  storageCredentialsService: { getCredentials: jest.fn() },
}));

jest.mock('./storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn(async () => false),
  isPortableSocialCloud: jest.fn(async () => false),
}));

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockIsPortable = isPortableStorageProvider as jest.Mock;

const PN = 'pn-custody-shell';

function completePnDriveIndex() {
  const sheetIds: Record<string, string> = {};
  for (const key of REQUIRED_PN_DRIVE_SHEET_KEYS) {
    sheetIds[key] = `sheet-${key}`;
  }
  sheetIds[PN_DRIVE_SHEET_KEYS.OWNED_ASSETS] = 'sheet-owned-assets';
  return {
    schemaVersion: 1,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox-sheet',
    sheetIds,
    conversationSheets: {},
  };
}

/** Custody shell: Drive layout present, no usable OAuth secrets on the API. */
function custodyShellRecord() {
  return {
    identityId: PN,
    credentials: {
      googleDriveAccounts: [
        {
          backendId: 'acct-1',
          access_token: '',
          refresh_token: '',
        },
      ],
      pnDriveIndex: completePnDriveIndex(),
    },
    cid: 'cid',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

describe('getOwnerStorageContext custody soft path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPortable.mockResolvedValue(false);
  });

  it('returns null (does not throw) when Drive shell has no access token', async () => {
    mockGetCredentials.mockResolvedValue(custodyShellRecord());

    await expect(getOwnerStorageContext(PN)).resolves.toBeNull();
  });

  it('returns google_drive context when accessToken is provided', async () => {
    mockGetCredentials.mockResolvedValue(custodyShellRecord());

    const ctx = await getOwnerStorageContext(PN, { accessToken: 'ya29.test-token' });
    expect(ctx).toEqual({
      kind: 'google_drive',
      pnIdentifier: PN,
      token: expect.objectContaining({ access_token: 'ya29.test-token' }),
      metadataFolderId: 'meta-folder',
      accountId: 'acct-1',
    });
  });

  it('hasOwnerStorage does not throw on custody shell without token', async () => {
    mockGetCredentials.mockResolvedValue(custodyShellRecord());

    await expect(hasOwnerStorage(PN)).resolves.toBe(false);
  });

  it('without soft path, getRecoveryDriveContext would throw (regression guard)', async () => {
    // Documents the hard-throw still exists for callers that omit softMissingToken.
    const { getRecoveryDriveContext } = await import('../recoveryDriveContext');
    mockGetCredentials.mockResolvedValue(custodyShellRecord());

    await expect(getRecoveryDriveContext(PN)).rejects.toBeInstanceOf(DriveIndexError);
    await expect(getRecoveryDriveContext(PN)).rejects.toMatchObject({
      code: 'CLOUD_TOKEN_REQUIRED',
    });
  });
});
