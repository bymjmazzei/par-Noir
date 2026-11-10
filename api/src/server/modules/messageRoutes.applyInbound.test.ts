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

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;

const USER = 'pn-recipient';
const PEER = 'pn-sender';

function buildApp() {
  const deps: MessageRouteDeps = {
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
  });

  it('requires connectionId', async () => {
    const res = await request(buildApp()).post('/api/messages/apply-inbound')
      .send(opaqueBody({ connectionId: '' }))
      .expect(400);
    expect(res.body.error).toMatch(/connectionId/i);
  });

  it('rejects unsupported jobType', async () => {
    const res = await request(buildApp()).post('/api/messages/apply-inbound')
      .send(opaqueBody({ jobType: 'notification_row' }))
      .expect(400);
    expect(res.body.error).toBe('Unsupported jobType');
  });

  it('persists a client-submitted ciphertext without opening Drive', async () => {
    const res = await request(buildApp())
      .post('/api/messages/apply-inbound')
      .send(opaqueBody({
        deviceCloudResult: { spreadsheetId: 'sheet-from-device', provider: 'google' },
      }))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.spreadsheetId).toBe('sheet-from-device');
    expect(res.body.encryptedContent).toBeTruthy();
  });

  it('refuses to open Drive when the device has not submitted a result', async () => {
    const res = await request(buildApp())
      .post('/api/messages/apply-inbound')
      .send(opaqueBody())
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
  });
});
