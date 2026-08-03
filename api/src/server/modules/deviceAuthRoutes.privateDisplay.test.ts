/**
 * @jest-environment node
 *
 * Register requires opaque privateDisplay; API must not invent cleartext labels.
 */
import type { Request, Response } from 'express';

const upsertDevice = jest.fn();
const listDevices = jest.fn();
const loadDeviceBundle = jest.fn();
const readPolicy = jest.fn();
const writePolicy = jest.fn();
const updateDevicePrivateDisplay = jest.fn();
const getDeviceById = jest.fn();

jest.mock('./storage/deviceStorageService', () => ({
  upsertDevice: (...args: unknown[]) => upsertDevice(...args),
  listDevices: (...args: unknown[]) => listDevices(...args),
  loadDeviceBundle: (...args: unknown[]) => loadDeviceBundle(...args),
  readPolicy: (...args: unknown[]) => readPolicy(...args),
  writePolicy: (...args: unknown[]) => writePolicy(...args),
  updateDevicePrivateDisplay: (...args: unknown[]) => updateDevicePrivateDisplay(...args),
  getDeviceById: (...args: unknown[]) => getDeviceById(...args),
}));

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: jest.fn(),
  },
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

import { PNOAuthService } from './pnOAuthService';
import { registerDeviceAuthRoutes } from './deviceAuthRoutes';
import { defaultDevicePolicy } from '@par-noir/device-auth';

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

function getPostHandler(path: string): RouteHandler {
  const app = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };
  registerDeviceAuthRoutes(app as never);
  const call = (app.post as jest.Mock).mock.calls.find((c) => c[0] === path);
  if (!call) throw new Error(`POST ${path} not registered`);
  return call[1] as RouteHandler;
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('device register privateDisplay', () => {
  const PN = 'pn-testuser';
  const opaque = '{"encrypted":"x","iv":"y","salt":"z"}';

  beforeEach(() => {
    jest.clearAllMocks();
    (PNOAuthService.validateAccessToken as jest.Mock).mockReturnValue({
      pnIdentifier: PN,
    });
    loadDeviceBundle.mockResolvedValue({ pnIdentifier: PN, isPortable: true });
    listDevices.mockResolvedValue([]);
    readPolicy.mockResolvedValue(defaultDevicePolicy());
    writePolicy.mockResolvedValue(undefined);
    upsertDevice.mockResolvedValue(undefined);
  });

  it('rejects register without privateDisplay', async () => {
    const handler = getPostHandler('/api/devices/register');
    const res = mockRes();
    await handler(
      {
        headers: { authorization: 'Bearer t' },
        body: {
          userPnIdentifier: PN,
          deviceId: 'dev-1',
          devicePublicKey: 'pk',
        },
      } as unknown as Request,
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'privateDisplay required' });
    expect(upsertDevice).not.toHaveBeenCalled();
  });

  it('stores opaque privateDisplay without cleartext label', async () => {
    const handler = getPostHandler('/api/devices/register');
    const res = mockRes();
    await handler(
      {
        headers: { authorization: 'Bearer t' },
        body: {
          userPnIdentifier: PN,
          deviceId: 'dev-1',
          devicePublicKey: 'pk',
          privateDisplay: opaque,
          label: 'SHOULD_NOT_PERSIST',
          deviceType: 'desktop',
        },
      } as unknown as Request,
      res
    );
    expect(upsertDevice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deviceId: 'dev-1',
        devicePublicKey: 'pk',
        privateDisplay: opaque,
        label: '',
        deviceType: 'other',
        lastSeenAt: '',
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, deviceId: 'dev-1' })
    );
  });
});
