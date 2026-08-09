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
  ConnectionsService: {
    generateConnectionId: jest.fn(() => 'conn-1'),
    upsertOwnConnectionRow: jest.fn(),
  },
}));

jest.mock('./socialRail', () => ({
  enqueueSocialJob: jest.fn(async () => true),
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
import { enqueueSocialJob } from './socialRail';
import { ActivityLedgerService } from './activityLedgerService';
import { NotificationService } from './notificationService';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockUpsertOwnRow = ConnectionsService.upsertOwnConnectionRow as jest.Mock;
const mockEnqueueSocialJob = enqueueSocialJob as jest.Mock;
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
    mockUpsertOwnRow.mockReset().mockResolvedValue(undefined);
    mockEnqueueSocialJob.mockReset().mockResolvedValue(true);
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

  it('does not touch the recipient credentials at all', async () => {
    bothPartiesConnected();

    await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);

    // Loading the recipient's row was the whole cross-user problem: under
    // custody it is a stripped shell and the write silently failed.
    for (const call of mockGetCredentials.mock.calls) {
      expect(call[0]).toBe(REQUESTER);
    }
    expect(mockGetAccessToken).not.toHaveBeenCalled();
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
    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
  });

  it('writes only the requester row and hands the recipient half to the mailbox', async () => {
    bothPartiesConnected();

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.connection).toEqual({
      connectionId: 'conn-1',
      userPnIdentifier: RECIPIENT,
      status: 'pending_sent',
      createdAt: expect.any(String),
    });

    expect(mockUpsertOwnRow).toHaveBeenCalledTimes(1);
    const [, metadataFolderId, ownerPn, row] = mockUpsertOwnRow.mock.calls[0];
    expect(metadataFolderId).toBe(`${REQUESTER}-meta`);
    expect(ownerPn).toBe(REQUESTER);
    expect(row).toMatchObject({
      connectionId: 'conn-1',
      userPnIdentifier: RECIPIENT,
      status: 'pending_sent',
    });

    expect(mockEnqueueSocialJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSocialJob.mock.calls[0][0]).toMatchObject({
      jobType: 'connection_request',
      peerPn: RECIPIENT,
      requestId: 'conn-1',
    });
  });

  it('forwards the client-sealed envelope and the context it was sealed under', async () => {
    bothPartiesConnected();

    await request(buildApp().app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        recipientEnvelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
        envelopeContext: 'connect:a:b',
      })
      .expect(200);

    expect(mockEnqueueSocialJob.mock.calls[0][0]).toMatchObject({
      envelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
      envelopeContext: 'connect:a:b',
    });
  });

  it('reports the request as undelivered rather than failing when the mailbox refuses', async () => {
    bothPartiesConnected();
    mockEnqueueSocialJob.mockResolvedValue(false);

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);

    // The requester's own row landed, so the call succeeded; delivered says
    // plainly that the peer has not been told.
    expect(res.body).toMatchObject({ success: true, delivered: false });
  });

  it('still succeeds when the activity ledger and notification fail', async () => {
    bothPartiesConnected();
    mockRecordActivity.mockRejectedValue(new Error('sheets unavailable'));
    mockNotify.mockRejectedValue(new Error('notification failed'));

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('fails with 500 when the requester row cannot be written', async () => {
    bothPartiesConnected();
    mockUpsertOwnRow.mockRejectedValue(new Error('sheets unavailable'));

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(500);
    expect(res.body.error).toBe('Failed to send connection request');
    expect(mockEnqueueSocialJob).not.toHaveBeenCalled();
  });

  it('refuses when the requester has only a stripped custody shell and no forwarded token', async () => {
    // This is the state every account is in under device cloud custody: the
    // stored row holds no access token, and the client must forward one.
    mockGetCredentials.mockResolvedValue({
      identityId: REQUESTER,
      credentials: { googleDriveAccounts: [{ backendId: 'req-acct' }] },
    });

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody());

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
    expect(mockEnqueueSocialJob).not.toHaveBeenCalled();
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
