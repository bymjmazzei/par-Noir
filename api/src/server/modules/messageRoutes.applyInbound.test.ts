/**
 * @jest-environment node
 *
 * POST /api/messages/apply-inbound — opaque mailbox payload (no from/to)
 * must resolve peer via connectionId and append ciphertext to Drive.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: jest.fn(() => 'hashed'),
  isDevVerbose: jest.fn(() => false),
}));

jest.mock('../utils/messagingLog', () => ({
  messagingLog: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: { getCredentials: jest.fn() },
}));

jest.mock('./ownerDriveToken', () => ({
  resolveOwnerDriveToken: jest.fn(async () => ({
    token: { access_token: 'owner-at' },
    accountId: 'acct-1',
  })),
  respondDriveTokenError: jest.fn(() => false),
}));

jest.mock('./pnDriveIndex', () => ({
  readPnDriveIndex: jest.fn(() => ({
    schemaVersion: 1,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox-sheet',
    sheetIds: { connections: 'conn-sheet' },
    conversationSheets: {},
  })),
  isPnDriveIndexComplete: jest.fn(() => true),
  PN_DRIVE_SHEET_KEYS: { CONNECTIONS: 'connections' },
}));

jest.mock('./connectionsSheetsService', () => ({
  ConnectionsSheetsService: {
    getConnectionById: jest.fn(),
    getConnectionsSheet: jest.fn(async () => 'conn-sheet'),
  },
}));

jest.mock('./messageSheetsService', () => ({
  MessageSheetsService: {
    getInboxConversationByParticipant: jest.fn(async () => ({
      spreadsheetId: 'conv-sheet',
      connectionId: 'conn-1',
    })),
    getOrCreateChannelMessagesFolder: jest.fn(async () => 'channel-msg'),
    getConversationSheet: jest.fn(async () => 'conv-sheet'),
    createConversationSheet: jest.fn(async () => 'conv-sheet'),
    getOrCreateMessagesFolder: jest.fn(async () => 'msg-folder'),
    getOrCreateInboxSheet: jest.fn(async () => 'inbox-sheet'),
    updateInboxEntryWithRetry: jest.fn(async () => undefined),
    appendMessage: jest.fn(async () => undefined),
  },
}));

jest.mock('./storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn(async () => false),
}));

jest.mock('./messagingReadCache', () => ({
  invalidateMessagingCachesForUsers: jest.fn(async () => undefined),
}));

import express from 'express';
import request from 'supertest';
import { setupMessageRoutes, MessageRouteDeps } from './messageRoutes';
import { storageCredentialsService } from './storageCredentialsService';
import { ConnectionsSheetsService } from './connectionsSheetsService';
import { MessageSheetsService } from './messageSheetsService';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetConnectionById = ConnectionsSheetsService.getConnectionById as jest.Mock;
const mockAppendMessage = MessageSheetsService.appendMessage as jest.Mock;

const USER = 'pn-recipient';
const PEER = 'pn-sender';
const CLOUD_TOKEN = 'fwd-cloud-token';

function withCloudToken(req: request.Test): request.Test {
  return req.set('X-PN-Cloud-Access-Token', CLOUD_TOKEN);
}

function buildApp() {
  const deps: MessageRouteDeps = {
    extractAccountId: (account: any) => account?.backendId || account?.keyPrefix,
    getMetadataFolder: jest.fn(async () => ({
      metadataFolderId: 'meta-folder',
      pnFolderId: 'pn-folder',
    })) as unknown as MessageRouteDeps['getMetadataFolder'],
    driveNotInitialized: jest.fn((res: express.Response) =>
      res.status(409).json({ error: 'drive_not_initialized' })
    ) as unknown as MessageRouteDeps['driveNotInitialized'],
    emitRealtime: jest.fn(),
  };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  setupMessageRoutes(app, deps);
  return app;
}

function opaqueBody(overrides: Record<string, unknown> = {}) {
  return {
    userPnIdentifier: USER,
    jobType: 'message_append',
    connectionId: 'conn-1',
    messageId: 'msg_opaque_1',
    encryptedContent: 'eyJ2IjoyLCJjaXBoZXJ0ZXh0IjoieCJ9',
    cryptoVersion: 2,
    timestamp: '2026-09-11T18:00:00.000Z',
    role: 'recipient',
    // deliberately no fromPnIdentifier / toPnIdentifier
    ...overrides,
  };
}

describe('POST /api/messages/apply-inbound', () => {
  beforeEach(() => {
    mockGetCredentials.mockReset().mockResolvedValue({
      identityId: USER,
      credentials: {
        googleDriveAccounts: [{ backendId: 'acct-1' }],
        pnDriveIndex: {},
      },
    });
    mockGetConnectionById.mockReset().mockResolvedValue({
      connectionId: 'conn-1',
      userPnIdentifier: PEER,
      status: 'accepted',
    });
    mockAppendMessage.mockReset().mockResolvedValue(undefined);
  });

  it('requires connectionId', async () => {
    const res = await withCloudToken(request(buildApp()).post('/api/messages/apply-inbound'))
      .send(opaqueBody({ connectionId: '' }))
      .expect(400);
    expect(res.body.error).toMatch(/connectionId/i);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it('rejects unsupported jobType', async () => {
    const res = await withCloudToken(request(buildApp()).post('/api/messages/apply-inbound'))
      .send(opaqueBody({ jobType: 'notification_row' }))
      .expect(400);
    expect(res.body.error).toBe('Unsupported jobType');
  });

  it('appends ciphertext when peer is resolved from connectionId only', async () => {
    const res = await withCloudToken(request(buildApp()).post('/api/messages/apply-inbound'))
      .send(opaqueBody())
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(mockGetConnectionById).toHaveBeenCalled();
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    const msgArg = mockAppendMessage.mock.calls[0][2];
    expect(msgArg.messageId).toBe('msg_opaque_1');
    expect(msgArg.encryptedContent).toBeTruthy();
    expect(msgArg.fromPnIdentifier).toBe(PEER);
    expect(msgArg.toPnIdentifier).toBe(USER);
    expect(msgArg.fromPnIdentifier && msgArg.toPnIdentifier).toBeTruthy();
  });

  it('returns 404 when connectionId does not resolve a peer', async () => {
    mockGetConnectionById.mockResolvedValue(null);
    const res = await withCloudToken(request(buildApp()).post('/api/messages/apply-inbound'))
      .send(opaqueBody())
      .expect(404);
    expect(res.body.error).toMatch(/Connection not found/i);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });
});
