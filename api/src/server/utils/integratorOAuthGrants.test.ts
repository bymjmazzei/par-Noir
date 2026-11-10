/**
 * The grant written at token exchange is what the dashboard later edits, so a
 * later unlock must not silently re-add something the user turned off.
 */

jest.mock('../modules/clientRegistration', () => ({
  ClientRegistrationService: {
    getClient: jest.fn().mockResolvedValue({ name: 'Some App', description: '' }),
  },
}));

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermission: jest.fn(),
    storePermission: jest.fn().mockResolvedValue(undefined),
  },
}));

import { getExistingGrant, persistIntegratorGrant } from '../modules/integratorOAuthGrants';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';

const mockGetPermission = ThirdPartyPermissionsService.getPermission as jest.Mock;
const mockStorePermission = ThirdPartyPermissionsService.storePermission as jest.Mock;

const PN = 'pn-59e4692524b7';

function storedPermission(clientId: string) {
  const call = mockStorePermission.mock.calls.at(-1);
  expect(call?.[0]).toBe(PN);
  expect(call?.[1]?.toolId).toBe(clientId);
  return call?.[1];
}

function exchange(overrides: {
  clientId?: string;
  scopes?: string[];
  grantedDataPoints?: string[];
}) {
  return persistIntegratorGrant({
    clientId: overrides.clientId ?? 'browser-app',
    scopes: overrides.scopes ?? ['openid', 'profile', 'zkp:over_21', 'cloud:read'],
    pnIdentifier: PN,
    grantedDataPoints: overrides.grantedDataPoints,
  });
}

describe('persistIntegratorGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermission.mockResolvedValue(null);
  });

  it('stores exactly what the user chose at consent', async () => {
    await exchange({ grantedDataPoints: ['over_21'] });
    expect(storedPermission('browser-app').dataPoints).toEqual(['over_21']);
  });

  it('does not re-add a data point the user disabled in the dashboard', async () => {
    mockGetPermission.mockResolvedValue({
      toolId: 'browser-app',
      status: 'active',
      dataPoints: [],
      optionalDataPoints: ['over_21'],
    });

    // Consent was skipped, so the request carries no choices
    await exchange({});

    expect(storedPermission('browser-app').dataPoints).toEqual([]);
  });

  it('keeps the previous choice for data points this request did not ask about', async () => {
    mockGetPermission.mockResolvedValue({
      toolId: 'browser-app',
      status: 'active',
      dataPoints: ['over_21', 'email'],
      optionalDataPoints: ['over_21', 'email'],
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

describe('getExistingGrant', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null without an active grant', async () => {
    mockGetPermission.mockResolvedValue(null);
    await expect(getExistingGrant('browser-app', PN)).resolves.toBeNull();
    mockGetPermission.mockResolvedValue({ toolId: 'browser-app', status: 'revoked', dataPoints: ['over_21'] });
    await expect(getExistingGrant('browser-app', PN)).resolves.toBeNull();
  });

  it('remembers declined data points as considered', async () => {
    mockGetPermission.mockResolvedValue({
      toolId: 'browser-app',
      status: 'active',
      dataPoints: ['over_21'],
      requiredDataPoints: [],
      optionalDataPoints: ['over_21', 'email'],
    });
    await expect(getExistingGrant('browser-app', '59e4692524b7')).resolves.toEqual({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21', 'email'],
    });
    expect(mockGetPermission).toHaveBeenCalledWith(PN, 'browser-app');
  });
});
