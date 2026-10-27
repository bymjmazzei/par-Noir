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
  gateRecoverySetup,
  getDeviceRegistrySummary,
  RECOVERY_SETUP_CHALLENGE_CLIENT_ID,
} from './deviceCapabilityService';
import { DriveIndexError } from './pnDriveIndex';
import { putUnlockChallengeRecord } from './oauthAuthCodeStore';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier, signRecoverySetupProof } from '@par-noir/pqc-crypto/oauth-unlock-proof';

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

  it('allows Case A bootstrap messages.read and profile.write when device bundle is missing', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq({ path: '/api/mailbox/route', method: 'POST' });
    const res = mockRes();

    const msgCtx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, PN);
    expect(msgCtx).not.toBeNull();
    expect(msgCtx?.isKeyed).toBe(false);

    const profileRes = mockRes();
    const profileCtx = await gateOwnerRoute(
      bearerReq({ path: '/api/profile/ml-kem-public-key', method: 'POST' }),
      profileRes,
      DEVICE_CAPABILITIES.profileWrite,
      PN
    );
    expect(profileCtx).not.toBeNull();
    expect(profileRes.statusCode).toBeUndefined();
  });

  it('still denies social.write on Case A when device bundle is missing (not allow-all)', async () => {
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<
      typeof PNOAuthService.validateAccessToken
    >);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq({ path: '/api/mailbox/enqueue', method: 'POST' });
    const res = mockRes();

    const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.socialWrite, PN);

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

  it('forwards X-PN-Cloud-Access-Token into loadDeviceBundle', async () => {
    clearDeviceContextCache(PN);
    mockValidate.mockReturnValue({ pnIdentifier: PN } as ReturnType<typeof PNOAuthService.validateAccessToken>);
    deviceStorage.loadDeviceBundle.mockResolvedValue(null);
    const req = bearerReq({
      headers: {
        authorization: 'Bearer test-token',
        'x-pn-cloud-access-token': 'ya29.forwarded-token',
      },
    });

    await assertDeviceCapability(req, DEVICE_CAPABILITIES.driveRead);

    expect(deviceStorage.loadDeviceBundle).toHaveBeenCalledWith(PN, {
      accessToken: 'ya29.forwarded-token',
    });
  });
});

describe('gateRecoverySetup', () => {
  const dsa = mlDsa65Keygen();
  const publicKey = bytesToBase64(dsa.publicKey);
  const ownerPn = deriveCanonicalPnIdentifier(publicKey);

  function useRegistry(firstDeviceKeyedAt: string | undefined, keyed: boolean) {
    clearDeviceContextCache();
    mockValidate.mockReturnValue({ pnIdentifier: ownerPn } as ReturnType<typeof PNOAuthService.validateAccessToken>);
    deviceStorage.loadDeviceBundle.mockResolvedValue({ pnIdentifier: ownerPn, isPortable: false, spreadsheetId: 's' });
    deviceStorage.readPolicy.mockResolvedValue({ ...defaultDevicePolicy(), firstDeviceKeyedAt });
    deviceStorage.listDevices.mockResolvedValue(
      keyed ? [{ deviceId: 'dev-1', status: 'active', devicePublicKey: 'pk', label: 'T', createdAt: KEYED_AT }] : []
    );
  }

  async function signedProof(pnBinding = ownerPn) {
    const challengeId = `c-${Math.random()}`;
    const challenge = `challenge-${challengeId}`;
    await putUnlockChallengeRecord(
      { challengeId, challenge, clientId: RECOVERY_SETUP_CHALLENGE_CLIENT_ID, redirectUri: pnBinding, expiresAt: Date.now() + 60_000 },
      60_000
    );
    const signature = signRecoverySetupProof({ challenge, pnIdentifier: ownerPn, publicKey }, dsa.secretKey);
    return { challengeId, publicKey, signature };
  }

  beforeEach(() => jest.clearAllMocks());

  it('accepts a signed setup challenge when no device has ever been keyed, once', async () => {
    useRegistry(undefined, false);
    const ownerProof = await signedProof();
    const first = mockRes();
    expect(await gateRecoverySetup(bearerReq({ body: { ownerProof } }), first)).not.toBeNull();
    const replay = mockRes();
    expect(await gateRecoverySetup(bearerReq({ body: { ownerProof } }), replay)).toBeNull();
    expect(replay.body).toEqual({ error: 'owner_proof_invalid', reason: 'challenge' });
  });

  it('requires the proof before any device is keyed', async () => {
    useRegistry(undefined, false);
    const res = mockRes();
    expect(await gateRecoverySetup(bearerReq({ body: {} }), res)).toBeNull();
    expect(res.body).toEqual({ error: 'owner_proof_required' });
  });

  it('rejects a challenge issued for another pN or a signature from another key', async () => {
    useRegistry(undefined, false);
    const wrongPn = mockRes();
    expect(await gateRecoverySetup(bearerReq({ body: { ownerProof: await signedProof('pn-other') } }), wrongPn)).toBeNull();
    expect(wrongPn.statusCode).toBe(403);

    const other = mlDsa65Keygen();
    const proof = await signedProof();
    const forged = mockRes();
    const forgedProof = { ...proof, signature: signRecoverySetupProof({ challenge: 'x', pnIdentifier: ownerPn, publicKey }, other.secretKey) };
    expect(await gateRecoverySetup(bearerReq({ body: { ownerProof: forgedProof } }), forged)).toBeNull();
    expect(forged.body).toEqual({ error: 'owner_proof_invalid', reason: 'signature' });
  });

  it('requires a keyed device once any device has been keyed, even with a valid proof', async () => {
    useRegistry(KEYED_AT, true);
    const res = mockRes();
    expect(await gateRecoverySetup(bearerReq({ body: { ownerProof: await signedProof() } }), res)).toBeNull();
    expect(res.body).toEqual({ error: 'device_key_required', reason: 'keyed_device_required' });
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
