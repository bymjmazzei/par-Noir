/**
 * @jest-environment node
 *
 * Validation and happy-path behaviour for the connection request/accept endpoints.
 * Drive, the credential store, and the connection service are all mocked.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/messagingLog', () => ({
  messagingLog: jest.fn(),
}));

jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: { getCredentials: jest.fn() },
}));

jest.mock('./googleDriveProxy', () => ({
  googleDriveProxyService: {
    getAccessToken: jest.fn(),
    forceRefreshAccessToken: jest.fn(),
  },
}));

jest.mock('./connectionsService', () => ({
  ConnectionsService: { sendConnectionRequest: jest.fn() },
}));

jest.mock('./activityLedgerService', () => ({
  ActivityLedgerService: { recordActivity: jest.fn() },
}));

jest.mock('./notificationService', () => ({
  NotificationService: { notifyConnectionRequest: jest.fn() },
}));

jest.mock('./storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn(async () => false),
}));

import express from 'express';
import request from 'supertest';
import { setupConnectionRoutes, ConnectionRouteDeps } from './connectionRoutes';
import { storageCredentialsService } from './storageCredentialsService';
import { googleDriveProxyService } from './googleDriveProxy';
import { ConnectionsService } from './connectionsService';
import { ActivityLedgerService } from './activityLedgerService';
import { NotificationService } from './notificationService';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockSendConnectionRequest = ConnectionsService.sendConnectionRequest as jest.Mock;
const mockRecordActivity = ActivityLedgerService.recordActivity as jest.Mock;
const mockNotify = NotificationService.notifyConnectionRequest as jest.Mock;

const REQUESTER = 'pn-requester';
const RECIPIENT = 'pn-recipient';
/** ML-KEM-768 encapsulation keys are 1184 bytes; the route rejects anything under 1000. */
const ML_KEM_PUBLIC_KEY = Buffer.alloc(1184, 7).toString('base64');

function buildApp(overrides: Partial<ConnectionRouteDeps> = {}) {
  const getMetadataFolder = jest.fn(async (_token: unknown, pn: string) => ({
    metadataFolderId: `${pn}-meta`,
    pnFolderId: `${pn}-root`,
  }));
  const driveNotInitialized = jest.fn((res: express.Response) =>
    res.status(409).json({ error: 'drive_not_initialized' })
  );
  const deps: ConnectionRouteDeps = {
    extractAccountId: (account: any) => account?.backendId || account?.keyPrefix,
    getMetadataFolder: getMetadataFolder as unknown as ConnectionRouteDeps['getMetadataFolder'],
    driveNotInitialized: driveNotInitialized as unknown as ConnectionRouteDeps['driveNotInitialized'],
    ...overrides,
  };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  setupConnectionRoutes(app, deps);
  return { app, getMetadataFolder, driveNotInitialized };
}

function bothPartiesConnected() {
  mockGetCredentials.mockImplementation(async (pn: string) => ({
    identityId: pn,
    credentials: { googleDriveAccounts: [{ backendId: `${pn}-acct`, access_token: 'tok' }] },
  }));
  mockGetAccessToken.mockImplementation(async (pn: string) => `${pn}-token`);
}

function validRequestBody() {
  return {
    requesterPnIdentifier: REQUESTER,
    recipientPnIdentifier: RECIPIENT,
    requesterMlKemPublicKey: ML_KEM_PUBLIC_KEY,
  };
}

describe('POST /api/connections/request', () => {
  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockGetAccessToken.mockReset();
    mockSendConnectionRequest.mockReset();
    mockRecordActivity.mockReset().mockResolvedValue(undefined);
    mockNotify.mockReset().mockResolvedValue(undefined);
  });

  it('requires both identifiers', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({ requesterPnIdentifier: REQUESTER })
      .expect(400);
    expect(res.body.error).toContain('recipientPnIdentifier');
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it('requires an ML-KEM public key', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({ requesterPnIdentifier: REQUESTER, recipientPnIdentifier: RECIPIENT })
      .expect(400);
    expect(res.body.error).toBe('requesterMlKemPublicKey is required');
  });

  it('rejects an ML-KEM public key that is too short to be genuine', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({ ...validRequestBody(), requesterMlKemPublicKey: Buffer.alloc(64).toString('base64') })
      .expect(400);
    expect(res.body.error).toBe('requesterMlKemPublicKey is invalid');
  });

  it('rejects a self-connection', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({ ...validRequestBody(), recipientPnIdentifier: REQUESTER })
      .expect(400);
    expect(res.body.error).toBe('Cannot connect to yourself');
  });

  it('returns 404 when the requester has no Drive connected', async () => {
    mockGetCredentials.mockResolvedValue({ identityId: REQUESTER, credentials: {} });

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(404);
    expect(res.body.error).toBe('Requester has no Google Drive connected');
  });

  it('returns 404 when the recipient is unknown to the network', async () => {
    mockGetCredentials.mockImplementation(async (pn: string) =>
      pn === REQUESTER
        ? {
            identityId: pn,
            credentials: { googleDriveAccounts: [{ backendId: 'req-acct', access_token: 'tok' }] },
          }
        : null
    );
    mockGetAccessToken.mockResolvedValue('requester-token');

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(404);
    expect(res.body.error).toBe('Recipient credentials not found');
  });

  it('reports drive-not-initialized when the requester layout is missing', async () => {
    bothPartiesConnected();
    const { app, driveNotInitialized } = buildApp({
      getMetadataFolder: jest.fn(
        async () => null
      ) as unknown as ConnectionRouteDeps['getMetadataFolder'],
    });

    await request(app).post('/api/connections/request').send(validRequestBody()).expect(409);
    expect(driveNotInitialized).toHaveBeenCalled();
    expect(mockSendConnectionRequest).not.toHaveBeenCalled();
  });

  it('creates the connection with both parties resolved', async () => {
    bothPartiesConnected();
    mockSendConnectionRequest.mockResolvedValue({ connectionId: 'conn-1', status: 'pending' });

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({ ...validRequestBody(), requesterMailboxRouteKey: '  route-key  ' })
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      connection: { connectionId: 'conn-1', status: 'pending' },
    });

    const args = mockSendConnectionRequest.mock.calls[0];
    expect(args[0]).toBe(`${REQUESTER}-token`);
    expect(args[1]).toBe(`${REQUESTER}-meta`);
    expect(args[2]).toBe(REQUESTER);
    expect(args[3]).toBe(`${RECIPIENT}-token`);
    expect(args[4]).toBe(`${RECIPIENT}-meta`);
    expect(args[5]).toBe(RECIPIENT);
    expect(args[9]).toBe('route-key');
  });

  it('records activity for both parties and notifies the recipient', async () => {
    bothPartiesConnected();
    mockSendConnectionRequest.mockResolvedValue({ connectionId: 'conn-1' });

    await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);

    expect(mockRecordActivity).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      `${RECIPIENT}-token`,
      `${RECIPIENT}-meta`,
      'conn-1',
      REQUESTER,
      RECIPIENT
    );
  });

  it('still succeeds when the activity ledger and notification fail', async () => {
    bothPartiesConnected();
    mockSendConnectionRequest.mockResolvedValue({ connectionId: 'conn-1' });
    mockRecordActivity.mockRejectedValue(new Error('sheets unavailable'));
    mockNotify.mockRejectedValue(new Error('notification failed'));

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('fails with 500 when the connection service returns no connectionId', async () => {
    bothPartiesConnected();
    mockSendConnectionRequest.mockResolvedValue({});

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(500);
    expect(res.body.error).toBe('Connection request created but missing connectionId');
  });

  it('fails with 500 when the requester Drive token cannot be minted', async () => {
    bothPartiesConnected();
    mockGetAccessToken.mockRejectedValue(new Error('token unavailable'));

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(500);
    expect(res.body.error).toBe('Failed to send connection request');
    expect(mockSendConnectionRequest).not.toHaveBeenCalled();
  });
});

describe('POST /api/connections/:connectionId/accept', () => {
  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockGetAccessToken.mockReset();
  });

  it('requires a userPnIdentifier', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/conn-1/accept')
      .send({})
      .expect(400);
    expect(res.body.error).toContain('userPnIdentifier');
  });

  it('requires an ML-KEM-768 key exchange payload', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/conn-1/accept')
      .send({ userPnIdentifier: RECIPIENT, kemCiphertext: 'ct', wrappedMessageRootKey: 'wk' })
      .expect(400);
    expect(res.body.error).toContain('ML-KEM-768');
  });

  it('rejects a non-post-quantum key exchange algorithm', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/conn-1/accept')
      .send({
        userPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
        wrappedMessageRootKey: 'wk',
        kemAlgId: 'X25519',
      })
      .expect(400);
    expect(res.body.error).toContain('ML-KEM-768');
  });

  it('returns 404 when the accepting identity has no credentials', async () => {
    mockGetCredentials.mockResolvedValue(null);

    const res = await request(buildApp().app)
      .post('/api/connections/conn-1/accept')
      .send({
        userPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
        wrappedMessageRootKey: 'wk',
        kemAlgId: 'ML-KEM-768',
      })
      .expect(404);
    expect(res.body.error).toBe('User credentials not found');
  });
});
