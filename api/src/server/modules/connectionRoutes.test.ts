/**
 * @jest-environment node
 *
 * Validation and happy-path behaviour for the connection request/accept endpoints.
 * Drive, the credential store, and the connection service are all mocked.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: jest.fn(() => 'hashed'),
  isDevVerbose: jest.fn(() => false),
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
    updateOtherUserConnectionStatus: jest.fn(),
    removeConnection: jest.fn(),
  },
}));

jest.mock('./messageSheetsService', () => ({
  MessageSheetsService: {
    getOrCreateChannelMessagesFolder: jest.fn(async () => 'msg-folder'),
    getConversationSheet: jest.fn(async () => {
      throw new Error('Conversation sheet not found');
    }),
    createConversationSheet: jest.fn(async () => 'conv-sheet'),
    getOrCreateMessagesFolder: jest.fn(async () => 'platform-msg'),
    getOrCreateInboxSheet: jest.fn(async () => 'inbox-sheet'),
    updateInboxEntryWithRetry: jest.fn(async () => undefined),
  },
}));

jest.mock('./pnDriveIndex', () => ({
  readPnDriveIndex: jest.fn(() => ({})),
  isPnDriveIndexComplete: jest.fn(() => false),
}));

jest.mock('./connectionsSheetsService', () => ({
  ConnectionsSheetsService: {
    getFollowersSheet: jest.fn(),
    addFollower: jest.fn(),
    removeFollower: jest.fn(),
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
import { MessageSheetsService } from './messageSheetsService';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockUpsertOwnRow = ConnectionsService.upsertOwnConnectionRow as jest.Mock;
const mockUpdateOtherStatus = ConnectionsService.updateOtherUserConnectionStatus as jest.Mock;
const mockEnqueueSocialJob = enqueueSocialJob as jest.Mock;
const mockRecordActivity = ActivityLedgerService.recordActivity as jest.Mock;
const mockNotify = NotificationService.notifyConnectionRequest as jest.Mock;
const mockCreateConversation = MessageSheetsService.createConversationSheet as jest.Mock;
const mockUpdateInbox = MessageSheetsService.updateInboxEntryWithRetry as jest.Mock;

const REQUESTER = 'pn-requester';
const RECIPIENT = 'pn-recipient';
/** ML-KEM-768 encapsulation keys are 1184 bytes; the route rejects anything under 1000. */
const ML_KEM_PUBLIC_KEY = Buffer.alloc(1184, 7).toString('base64');
/** Under device custody every owner Drive call needs the forwarded header. */
const CLOUD_TOKEN = 'fwd-cloud-token';

function withCloudToken(req: request.Test): request.Test {
  return req.set('X-PN-Cloud-Access-Token', CLOUD_TOKEN);
}

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
    credentials: {
      // Layout shell only — under custody secrets are not on the server.
      googleDriveAccounts: [{ backendId: `${pn}-acct` }],
    },
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

  it('refuses to open Drive when the device has not submitted a result', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
    expect(mockEnqueueSocialJob).not.toHaveBeenCalled();
  });

  it('does not touch the recipient credentials at all', async () => {
    bothPartiesConnected();

    await request(buildApp().app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
      })
      .expect(200);
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it('does not open Drive when the device already wrote the row', async () => {
    bothPartiesConnected();
    const { app, driveNotInitialized } = buildApp({
      getMetadataFolder: jest.fn(
        async () => null
      ) as unknown as ConnectionRouteDeps['getMetadataFolder'],
    });

    await request(app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
      })
      .expect(200);
    expect(driveNotInitialized).not.toHaveBeenCalled();
    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
  });

  it('hands the recipient half to the mailbox after the device write', async () => {
    bothPartiesConnected();

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', connectionId: 'conn-1', provider: 'google' },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.connection).toEqual({
      connectionId: 'conn-1',
      userPnIdentifier: RECIPIENT,
      status: 'pending_sent',
      createdAt: expect.any(String),
    });

    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
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
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
        recipientEnvelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
        envelopeContext: 'connect:a:b',
      })
      .expect(200);

    expect(mockEnqueueSocialJob.mock.calls[0][0]).toMatchObject({
      envelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
      envelopeContext: 'connect:a:b',
    });
  });

  it('returns 409 when the peer mailbox cannot receive the job', async () => {
    bothPartiesConnected();
    mockEnqueueSocialJob.mockResolvedValue(false);

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
      })
      .expect(409);

    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      delivered: false,
      error: 'peer_mailbox_unavailable',
    });
  });

  it('still delivers the mailbox job when the device already wrote the row', async () => {
    bothPartiesConnected();
    mockRecordActivity.mockRejectedValue(new Error('sheets unavailable'));
    mockNotify.mockRejectedValue(new Error('notification failed'));

    const res = await request(buildApp().app)
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
      })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(mockUpsertOwnRow).not.toHaveBeenCalled();
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

  it('refuses accept until the device submits the connections sheet receipt', async () => {
    mockGetCredentials.mockResolvedValue(null);

    const res = await request(buildApp().app)
      .post('/api/connections/conn-1/accept')
      .send({
        userPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
        wrappedMessageRootKey: 'wk',
        kemAlgId: 'ML-KEM-768',
      })
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
  });
});

describe('POST /api/connections/apply-inbound connection_accept', () => {
  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockUpdateOtherStatus.mockReset().mockResolvedValue(undefined);
    mockCreateConversation.mockClear();
    mockUpdateInbox.mockClear();
    bothPartiesConnected();
  });

  it('refuses to open Drive when the device has not submitted a result', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/apply-inbound')
      .send({
        userPnIdentifier: REQUESTER,
        jobType: 'connection_accept',
        peerPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
      })
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
    expect(mockUpdateOtherStatus).not.toHaveBeenCalled();
  });

  it('persists a client-submitted connection result without opening Drive', async () => {
    const res = await request(buildApp().app)
      .post('/api/connections/apply-inbound')
      .send({
        userPnIdentifier: REQUESTER,
        jobType: 'connection_accept',
        peerPnIdentifier: RECIPIENT,
        requestId: 'conn-legacy-1',
        deviceCloudResult: { spreadsheetId: 'sheet-from-device', provider: 'google' },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.spreadsheetId).toBe('sheet-from-device');
    expect(mockUpdateOtherStatus).not.toHaveBeenCalled();
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });
});
