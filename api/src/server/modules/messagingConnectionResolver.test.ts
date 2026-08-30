/**
 * @jest-environment node
 */
jest.mock('./pnDriveIndex', () => ({
  PN_DRIVE_SHEET_KEYS: { CONNECTIONS: 'connections' },
}));

import type { OwnerDriveContext } from './ownerDriveContext';
import { resolveDmConnectionFromIndex } from './messagingConnectionResolver';

const CONNECTIONS_KEY = 'connections';

const mockGetInbox = jest.fn();
const mockGetConnections = jest.fn();

jest.mock('./messageSheetsService', () => ({
  MessageSheetsService: {
    getInboxConversationByParticipant: (...args: unknown[]) => mockGetInbox(...args),
  },
}));

jest.mock('./connectionsSheetsService', () => ({
  ConnectionsSheetsService: {
    getConnections: (...args: unknown[]) => mockGetConnections(...args),
  },
}));

function makeCtx(): OwnerDriveContext {
  return {
    pnIdentifier: 'pn-user1',
    accountId: 'acc-1',
    token: { access_token: 'tok' },
    credentials: {},
    index: {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta-folder',
      integratorsRootId: 'int-root',
      messagesFolderId: 'msg-folder',
      inboxSheetId: 'inbox-sheet',
      sheetIds: { [CONNECTIONS_KEY]: 'conn-sheet-id' },
      conversationSheets: {},
    },
    sheetId: (key) => {
      if (key === CONNECTIONS_KEY) return 'conn-sheet-id';
      throw new Error(`missing ${key}`);
    },
    conversationSheetId: () => undefined,
  };
}

describe('resolveDmConnectionFromIndex', () => {
  beforeEach(() => {
    mockGetInbox.mockReset();
    mockGetConnections.mockReset();
  });

  it('returns inbox connection without reading connections sheet', async () => {
    mockGetInbox.mockResolvedValue({
      connectionId: 'conn_abc',
      kemCiphertext: 'kem-data',
      spreadsheetId: 'conv-sheet',
      wrappedMessageRootKey: 'wrapped',
    });

    const result = await resolveDmConnectionFromIndex(makeCtx(), 'pn-user2');

    expect(result).toEqual({
      connectionId: 'conn_abc',
      kemCiphertext: 'kem-data',
      conversationSpreadsheetId: 'conv-sheet',
      wrappedMessageRootKey: 'wrapped',
      status: 'connected',
      channelClientId: 'platform',
    });
    expect(mockGetConnections).not.toHaveBeenCalled();
  });

  it('falls back to indexed connections sheet when inbox miss', async () => {
    mockGetInbox.mockResolvedValue(null);
    mockGetConnections.mockResolvedValue({
      connections: [
        {
          connectionId: 'conn_xyz',
          userPnIdentifier: 'pn-user2',
          status: 'accepted',
          createdAt: '2026-01-01T00:00:00.000Z',
          kemCiphertext: 'kem-fallback',
        },
      ],
      total: 1,
    });

    const result = await resolveDmConnectionFromIndex(makeCtx(), 'pn-user2');

    expect(mockGetConnections).toHaveBeenCalledWith(
      { access_token: 'tok' },
      'conn-sheet-id',
      'pn-user1',
      'acc-1'
    );
    expect(result).toEqual({
      connectionId: 'conn_xyz',
      kemCiphertext: 'kem-fallback',
      status: 'connected',
      channelClientId: 'platform',
    });
  });

  it('resolves L5 channel against inbox with channel arg', async () => {
    mockGetInbox.mockResolvedValue({
      connectionId: 'conn_acme',
      spreadsheetId: 'acme-sheet',
      channelClientId: 'acme',
    });
    const result = await resolveDmConnectionFromIndex(makeCtx(), 'pn-user2', 'acme');
    expect(mockGetInbox).toHaveBeenCalledWith(
      expect.anything(),
      'inbox-sheet',
      'pn-user2',
      'pn-user1',
      'acc-1',
      50,
      'acme'
    );
    expect(result).toMatchObject({
      connectionId: 'conn_acme',
      channelClientId: 'acme',
      status: 'connected',
    });
  });

  it('maps blocked peer', async () => {
    mockGetInbox.mockResolvedValue(null);
    mockGetConnections.mockResolvedValue({
      connections: [
        {
          connectionId: 'conn_blocked',
          userPnIdentifier: 'pn-user2',
          status: 'blocked',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
    });

    const result = await resolveDmConnectionFromIndex(makeCtx(), 'pn-user2');
    expect(result?.status).toBe('blocked');
  });

  it('propagates 429 from connections read', async () => {
    mockGetInbox.mockResolvedValue(null);
    const rateLimit = Object.assign(new Error('quota'), { code: 429 });
    mockGetConnections.mockRejectedValue(rateLimit);

    await expect(resolveDmConnectionFromIndex(makeCtx(), 'pn-user2')).rejects.toMatchObject({
      code: 429,
    });
  });
});
