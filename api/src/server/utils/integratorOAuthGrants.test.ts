/**
 * The grant written at token exchange is what the dashboard later edits, so a
 * later unlock must not silently re-add something the user turned off.
 */

jest.mock('../modules/clientRegistration', () => ({
  ClientRegistrationService: {
    getClient: jest.fn().mockResolvedValue({ name: 'Some App', description: '' }),
  },
}));

jest.mock('../modules/integratorFolderService', () => ({
  IntegratorFolderService: {
    ensureIntegratorFolder: jest.fn().mockResolvedValue({ integratorFolderId: 'folder-1' }),
  },
}));

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
    storePermissions: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../modules/pnDriveIndex', () => ({
  loadPnDriveIndex: jest.fn().mockResolvedValue({ metadataFolderId: 'meta-folder' }),
  isPnDriveIndexComplete: jest.fn().mockReturnValue(true),
  PN_DRIVE_SHEET_KEYS: {},
}));

import { persistIntegratorGrantAfterTokenExchange } from '../modules/integratorOAuthGrants';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';

const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.Mock;
const mockStorePermissions = ThirdPartyPermissionsService.storePermissions as jest.Mock;

const PN = 'pn-59e4692524b7';

function storedPermission(clientId: string) {
  const call = mockStorePermissions.mock.calls.at(-1);
  return call?.[3]?.[clientId];
}

function exchange(overrides: {
  clientId?: string;
  scopes?: string[];
  grantedDataPoints?: string[];
}) {
  return persistIntegratorGrantAfterTokenExchange({
    clientId: overrides.clientId ?? 'browser-app',
    scopes: overrides.scopes ?? ['openid', 'profile', 'zkp:over_21', 'cloud:read'],
    tokenPayload: { pnIdentifier: PN } as never,
    userAccessToken: 'tok',
    grantedDataPoints: overrides.grantedDataPoints,
  });
}

describe('persistIntegratorGrantAfterTokenExchange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({});
  });

  it('stores exactly what the user chose at consent', async () => {
    await exchange({ grantedDataPoints: ['over_21'] });
    expect(storedPermission('browser-app').dataPoints).toEqual(['over_21']);
  });

  it('does not re-add a data point the user disabled in the dashboard', async () => {
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: [],
        optionalDataPoints: ['over_21'],
      },
    });

    // Consent was skipped, so the request carries no choices
    await exchange({});

    expect(storedPermission('browser-app').dataPoints).toEqual([]);
  });

  it('keeps the previous choice for data points this request did not ask about', async () => {
    mockGetPermissions.mockResolvedValue({
      'browser-app': {
        toolId: 'browser-app',
        status: 'active',
        dataPoints: ['over_21', 'email'],
        optionalDataPoints: ['over_21', 'email'],
      },
    });

    await exchange({ scopes: ['openid', 'profile', 'zkp:over_21'], grantedDataPoints: [] });

    expect(storedPermission('browser-app').dataPoints).toEqual(['email']);
  });

  it('records what was offered so a decline is not re-prompted', async () => {
    await exchange({ grantedDataPoints: [] });

    const permission = storedPermission('browser-app');
    expect(permission.dataPoints).toEqual([]);
    expect(permission.optionalDataPoints).toEqual(['over_21']);
  });

  it('stamps the messaging contract with no data points', async () => {
    await exchange({
      clientId: 'messaging-app',
      scopes: ['openid', 'profile', 'cloud:read'],
    });

    const permission = storedPermission('messaging-app');
    expect(permission.dataPoints).toEqual([]);
    expect(permission.optionalDataPoints).toEqual([]);
    expect(permission.permissions).toEqual(['openid', 'profile', 'cloud:read']);
  });

  it('records requested points as considered for a third-party client', async () => {
    await exchange({
      clientId: 'some-third-party',
      scopes: ['openid', 'profile', 'zkp:over_21'],
      grantedDataPoints: ['over_21'],
    });

    const permission = storedPermission('some-third-party');
    expect(permission.dataPoints).toEqual(['over_21']);
    expect(permission.optionalDataPoints).toEqual(['over_21']);
  });
});
