/**
 * @jest-environment node
 *
 * Device registry reset finalize reads the relay request (no owner Drive token on the server).
 */
import type { Request, Response } from 'express';

const resetDeviceRegistry = jest.fn();
const loadDeviceBundle = jest.fn();

jest.mock('./storage/deviceStorageService', () => ({
  upsertDevice: jest.fn(),
  listDevices: jest.fn(),
  loadDeviceBundle: (...args: unknown[]) => loadDeviceBundle(...args),
  readPolicy: jest.fn(),
  writePolicy: jest.fn(),
  updateDevicePrivateDisplay: jest.fn(),
  getDeviceById: jest.fn(),
  resetDeviceRegistry: (...args: unknown[]) => resetDeviceRegistry(...args),
}));

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: { validateAccessToken: jest.fn() },
}));

jest.mock('./devicePairingNonceStore', () => ({
  consumePairingNonce: jest.fn(),
  storePairingNonce: jest.fn(),
}));

jest.mock('./deviceCapabilityService', () => ({
  assertDeviceCapability: jest.fn(),
  requireKeyedDevice: jest.fn(),
  getDeviceRegistrySummary: jest.fn(),
  DEVICE_CAPABILITIES: { deviceManage: 'device.manage' },
}));

process.env.RECOVERY_PEPPER = 'test-pepper';

import { PNOAuthService } from './pnOAuthService';
import { registerDeviceAuthRoutes } from './deviceAuthRoutes';
import {
  recoveryOwnerHash,
  setRecoveryRelayStoreForTests,
  type RecoveryCustodianRow,
  type RecoveryRequestRow,
} from './recoveryRelayService';
import { createMemoryRecoveryRelayStore } from './recoveryRelay.testStore';

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

function finalizeHandler(): RouteHandler {
  const app = { get: jest.fn(), post: jest.fn(), patch: jest.fn() };
  registerDeviceAuthRoutes(app as never);
  const call = (app.post as jest.Mock).mock.calls.find((c) => c[0] === '/api/devices/registry/reset/finalize');
  return call[1] as RouteHandler;
}

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

const PN = 'pn-owner';

function custodian(id: string, shareIndex: number, unrevokable: boolean): RecoveryCustodianRow {
  const now = new Date().toISOString();
  return {
    ownerHash: recoveryOwnerHash(PN),
    custodianId: id,
    ownerPublicKey: 'owner',
    custodianPnHash: `hash-${id}`,
    name: id,
    custodianType: 'person',
    shareIndex,
    custodianshipCredential: 'cred',
    unrevokable,
    status: 'accepted',
    mlKemPublicKey: 'k',
    custodyEpoch: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function request(overrides: Partial<RecoveryRequestRow>): RecoveryRequestRow {
  const now = Date.now();
  return {
    requestId: 'device-reset-1',
    requestType: 'device_registry_reset',
    ownerHash: recoveryOwnerHash(PN),
    ownerPublicKey: 'owner',
    temporaryPublicKey: null,
    threshold: 2,
    epoch: 1,
    claimantContact: '',
    status: 'ready',
    approvals: [
      { custodianId: 'c1', shareIndex: 1, approvedAt: new Date(now).toISOString() },
      { custodianId: 'c2', shareIndex: 2, approvedAt: new Date(now).toISOString() },
    ],
    releaseAfter: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

describe('device registry reset finalize', () => {
  let store: ReturnType<typeof createMemoryRecoveryRelayStore>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (PNOAuthService.validateAccessToken as jest.Mock).mockReturnValue({ pnIdentifier: PN });
    loadDeviceBundle.mockResolvedValue({ pnIdentifier: PN });
    resetDeviceRegistry.mockResolvedValue({ revoked: 2 });
    store = createMemoryRecoveryRelayStore();
    setRecoveryRelayStoreForTests(store);
    await store.upsertCustodian(custodian('c1', 1, true));
    await store.upsertCustodian(custodian('c2', 2, false));
  });

  afterAll(() => setRecoveryRelayStoreForTests(null));

  async function finalize(requestId: string) {
    const res = mockRes();
    await finalizeHandler()(
      { headers: { authorization: 'Bearer t' }, body: { requestId } } as unknown as Request,
      res
    );
    return res;
  }

  it('resets the registry once custodian quorum is ready and completes the request', async () => {
    await store.insertRequest(request({}));
    const res = await finalize('device-reset-1');
    expect(resetDeviceRegistry).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, revoked: 2 });
    expect(store.requests.get('device-reset-1')!.status).toBe('completed');
  });

  it('refuses before quorum', async () => {
    await store.insertRequest(request({ status: 'pending', approvals: [] }));
    const res = await finalize('device-reset-1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(resetDeviceRegistry).not.toHaveBeenCalled();
  });

  it("does not finalize another owner's request", async () => {
    await store.insertRequest(request({ ownerHash: recoveryOwnerHash('pn-someone') }));
    const res = await finalize('device-reset-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(resetDeviceRegistry).not.toHaveBeenCalled();
  });
});
