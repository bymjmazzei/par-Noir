/**
 * @jest-environment node
 */
import type { Request, Response } from 'express';
import { defaultDevicePolicy, DEVICE_CAPABILITIES } from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import { getRecoveryDriveContext } from './recoveryDriveContext';
import { DeviceSheetsService } from './deviceSheetsService';
import {
  assertDeviceCapability,
  clearDeviceContextCache,
  gateOwnerRoute,
  gateOwnerSelfRoute,
  getDeviceRegistrySummary,
} from './deviceCapabilityService';
import { DriveIndexError } from './pnDriveIndex';

jest.mock('./storage/deviceStorageService', () => ({
  loadDeviceBundle: jest.fn(),
  listDevices: jest.fn(),
  readPolicy: jest.fn(),
}));

const deviceStorage = jest.requireMock('./storage/deviceStorageService') as {
  loadDeviceBundle: jest.Mock;
  listDevices: jest.Mock;
  readPolicy: jest.Mock;
};

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: jest.fn(),
  },
}));

jest.mock('./recoveryDriveContext', () => ({
  getRecoveryDriveContext: jest.fn(),
}));

jest.mock('./deviceSheetsService', () => ({
  DeviceSheetsService: {
    getOrCreateSpreadsheet: jest.fn(),
    readPolicy: jest.fn(),
    listDevices: jest.fn(),
  },
}));

const mockValidate = PNOAuthService.validateAccessToken as jest.MockedFunction<
  typeof PNOAuthService.validateAccessToken
>;
const mockDriveContext = getRecoveryDriveContext as jest.MockedFunction<typeof getRecoveryDriveContext>;
const mockGetSpreadsheet = DeviceSheetsService.getOrCreateSpreadsheet as jest.MockedFunction<
  typeof DeviceSheetsService.getOrCreateSpreadsheet
>;
const mockReadPolicy = DeviceSheetsService.readPolicy as jest.MockedFunction<
  typeof DeviceSheetsService.readPolicy
>;
const mockListDevices = DeviceSheetsService.listDevices as jest.MockedFunction<
  typeof DeviceSheetsService.listDevices
>;

const PN = 'pn-testuser';
const KEYED_AT = '2026-01-01T00:00:00.000Z';

function bearerReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/profile/display-name',
    headers: { authorization: 'Bearer test-token' },
    body: { userPnIdentifier: PN },
    ...overrides,
  } as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res: Response & { statusCode?: number; body?: unknown } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  } as Response;
  return res;
}

function setupDriveContext(policy: ReturnType<typeof defaultDevicePolicy>, isKeyed: boolean) {
  clearDeviceContextCache(PN);
  mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<typeof PNOAuthService.validateAccessToken>);
  deviceStorage.loadDeviceBundle.mockResolvedValue({
    pnIdentifier: PN,
    isPortable: false,
    spreadsheetId: 'sheet-id',
    token: { access_token: 'tok' },
  });
  deviceStorage.readPolicy.mockResolvedValue(policy);
  deviceStorage.listDevices.mockResolvedValue(
    isKeyed
      ? [
          {
            deviceId: 'dev-1',
            status: 'active',
            devicePublicKey: 'pk',
            label: 'Test',
            createdAt: KEYED_AT,
          },
        ]
      : []
  );
}

describe('gateOwnerRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDeviceContextCache();
  });

  it('returns 401 when bearer token is missing', async () => {
    const req = { headers: {}, method: 'GET', path: '/api/drive/files', body: {} } as Request;
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('returns 403 when bearer pn does not match targetPn', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: 'pn-other' } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    const req = bearerReq();
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', reason: 'pn_mismatch' });
  });

  it('returns 403 device_key_required for immutable deny on unkeyed session', async () => {
    setupDriveContext({ ...defaultDevicePolicy(), firstDeviceKeyedAt: KEYED_AT }, false);
    const req = bearerReq({ path: '/api/recovery/custodians' });
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryCustodianManage, PN);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'device_key_required', reason: 'device_required' });
  });

  it('returns 403 capability_not_allowed when unkeyed and capability not in policy', async () => {
    setupDriveContext({ ...defaultDevicePolicy(), firstDeviceKeyedAt: KEYED_AT }, false);
    const req = bearerReq();
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'capability_not_allowed', reason: 'capability_not_allowed' });
  });

  it('allows unkeyed session when Drive device bundle is missing', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq({ path: `/api/storage/credentials/${PN}`, method: 'PUT' });
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, PN);

    expect(ctx).not.toBeNull();
    expect(ctx?.isKeyed).toBe(false);
    expect(res.statusCode).toBeUndefined();
  });

  it('denies mailbox drain when device bundle is missing (legacy bootstrap, not allow-all)', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq({ path: '/api/mailbox/pending', method: 'GET' });
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, PN);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'device_key_required', reason: 'device_required' });
  });

  it('returns 403 device_key_required for drive.upload on unkeyed restricted', async () => {
    setupDriveContext({ ...defaultDevicePolicy(), firstDeviceKeyedAt: KEYED_AT }, false);
    const req = bearerReq({ path: `/api/storage/cloud-vault/${PN}`, method: 'PUT' });
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, PN);

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'device_key_required', reason: 'device_required' });
  });

  it('allows unkeyed session when capability is toggled in unkeyedAllows', async () => {
    setupDriveContext(
      {
        ...defaultDevicePolicy(),
        firstDeviceKeyedAt: KEYED_AT,
        unkeyedAllows: [...defaultDevicePolicy().unkeyedAllows, DEVICE_CAPABILITIES.profileWrite],
      },
      false
    );
    const req = bearerReq();
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);

    expect(ctx).not.toBeNull();
    expect(ctx?.isKeyed).toBe(false);
    expect(res.statusCode).toBeUndefined();
  });

  it('allows keyed session with valid device proof headers', async () => {
    setupDriveContext({ ...defaultDevicePolicy(), firstDeviceKeyedAt: KEYED_AT }, true);
    const req = bearerReq({
      headers: {
        authorization: 'Bearer test-token',
        'x-pn-device-id': 'dev-1',
        'x-pn-device-signature': 'sig',
        'x-pn-device-timestamp': String(Date.now()),
        'x-pn-device-nonce': 'nonce',
      },
    });
    const res = mockRes();

    const verifyModule = await import('@par-noir/device-auth');
    const verifySpy = jest.spyOn(verifyModule, 'verifyDeviceProof').mockResolvedValue(true);
    const hashSpy = jest.spyOn(verifyModule, 'hashRequestBody').mockResolvedValue('hash');
    jest.spyOn(verifyModule, 'isDeviceProofTimestampValid').mockReturnValue(true);

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);

    expect(ctx).not.toBeNull();
    expect(ctx?.isKeyed).toBe(true);
    expect(res.statusCode).toBeUndefined();

    verifySpy.mockRestore();
    hashSpy.mockRestore();
  });
});

describe('gateOwnerSelfRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDeviceContextCache();
  });

  it('skips gate when unauthenticated (public profile read)', async () => {
    const req = { headers: {}, method: 'GET', path: `/api/profile/${PN}`, body: {} } as Request;
    const res = mockRes();

    const ok = await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, PN);

    expect(ok).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it('blocks self profile read on unkeyed when profile.read removed from policy', async () => {
    setupDriveContext(
      {
        ...defaultDevicePolicy(),
        firstDeviceKeyedAt: KEYED_AT,
        unkeyedAllows: defaultDevicePolicy().unkeyedAllows.filter(
          (c) => c !== DEVICE_CAPABILITIES.profileRead
        ),
      },
      false
    );
    const req = bearerReq({ method: 'GET', path: `/api/profile/${PN}` });
    const res = mockRes();

    const ok = await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, PN);

    expect(ok).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'capability_not_allowed', reason: 'capability_not_allowed' });
  });
});

describe('device context cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDeviceContextCache();
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    deviceStorage.loadDeviceBundle.mockResolvedValue({
      pnIdentifier: PN,
      isPortable: false,
      spreadsheetId: 'devices-sheet',
      token: { access_token: 'tok' },
    });
    deviceStorage.readPolicy.mockResolvedValue({
      ...defaultDevicePolicy(),
      firstDeviceKeyedAt: KEYED_AT,
      unkeyedAllows: [...defaultDevicePolicy().unkeyedAllows, DEVICE_CAPABILITIES.profileWrite],
    });
    deviceStorage.listDevices.mockResolvedValue([]);
  });

  it('loads device sheet once per pN within TTL for repeated gate calls', async () => {
    const req = bearerReq();
    const res = mockRes();

    await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);
    await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, PN);

    expect(deviceStorage.loadDeviceBundle).toHaveBeenCalledTimes(1);
    expect(deviceStorage.listDevices).toHaveBeenCalledTimes(1);
  });
});

describe('assertDeviceCapability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows unkeyed bootstrap when device bundle is unavailable', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<typeof PNOAuthService.validateAccessToken>);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq();

    const result = await assertDeviceCapability(req, DEVICE_CAPABILITIES.profileRead);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.isKeyed).toBe(false);
    }
  });

  it('treats CLOUD_TOKEN_REQUIRED from loadDeviceBundle as unkeyed (no throw)', async () => {
    clearDeviceContextCache(PN);
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<typeof PNOAuthService.validateAccessToken>);
    deviceStorage.loadDeviceBundle.mockRejectedValue(
      new DriveIndexError('token required', 'CLOUD_TOKEN_REQUIRED')
    );
    const req = bearerReq();
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, PN);

    expect(ctx).not.toBeNull();
    expect(ctx?.isKeyed).toBe(false);
    expect(res.statusCode).toBeUndefined();
  });
});

describe('getDeviceRegistrySummary custody soft path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDeviceContextCache();
  });

  it('returns null when loadDeviceBundle throws CLOUD_TOKEN_REQUIRED', async () => {
    deviceStorage.loadDeviceBundle.mockRejectedValue(
      new DriveIndexError('token required', 'CLOUD_TOKEN_REQUIRED')
    );

    await expect(getDeviceRegistrySummary(PN)).resolves.toBeNull();
  });

  it('returns null when loadDeviceBundle returns null (soft owner context)', async () => {
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);

    await expect(getDeviceRegistrySummary(PN)).resolves.toBeNull();
  });
});
