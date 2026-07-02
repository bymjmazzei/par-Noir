/**
 * @jest-environment node
 */

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockAppend = jest.fn();
const mockClear = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockDriveFilesList = jest.fn();
const mockDriveFilesGet = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: {
          get: (...args: unknown[]) => mockGet(...args),
          update: (...args: unknown[]) => mockUpdate(...args),
          append: (...args: unknown[]) => mockAppend(...args),
          clear: (...args: unknown[]) => mockClear(...args),
        },
        get: (...args: unknown[]) => mockSpreadsheetsGet(...args),
        batchUpdate: (...args: unknown[]) => mockBatchUpdate(...args),
      },
    }),
    drive: () => ({
      files: {
        list: (...args: unknown[]) => mockDriveFilesList(...args),
        get: (...args: unknown[]) => mockDriveFilesGet(...args),
      },
    }),
  },
}));

jest.mock('./googleOAuth2Helper', () => ({
  GoogleOAuth2Helper: {
    createClient: jest.fn(() => ({})),
  },
}));

jest.mock('./storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn().mockResolvedValue(false),
}));

jest.mock('./storage/messagePortableService', () => ({}));

jest.mock('./messagingReadCache', () => ({
  getCachedGroupFileMtime: jest.fn().mockResolvedValue(null),
  setCachedGroupFileMtime: jest.fn().mockResolvedValue(undefined),
}));

import { MessageSheetsService } from './messageSheetsService';

const token = { access_token: 'tok' };

describe('MessageSheetsService messaging quota optimizations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockUpdate.mockResolvedValue({});
    mockAppend.mockResolvedValue({});
    mockBatchUpdate.mockResolvedValue({});
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [{ properties: { title: 'Messages', sheetId: 42 } }],
      },
    });
  });

  it('getMessages rethrows per-minute quota without full-sheet fallback', async () => {
    const quotaError = new Error(
      "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'"
    );

    mockGet.mockRejectedValueOnce(quotaError);

    await expect(
      MessageSheetsService.getMessages(
        token,
        'sheet-1',
        'conn-1',
        '',
        'pn-test',
        'acct-1',
        { limit: 10, offset: 0, relayOnly: true }
      )
    ).rejects.toThrow(/Quota exceeded/);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0].range).toBe('Messages!A2:I11');
  });

  it('markAsRead uses bounded column-D lookup and updates the matching row', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        values: [['msg-a'], ['msg-target'], ['msg-c']],
      },
    });
    mockUpdate.mockResolvedValueOnce({});

    await MessageSheetsService.markAsRead(
      token,
      'sheet-1',
      'msg-target',
      'pn-test',
      'acct-1',
      20
    );

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0].range).toBe('Messages!D2:D21');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Messages!E3:F3',
      })
    );
  });

  it('updateInboxEntry upserts directory row without full-sheet re-sort', async () => {
    mockGet.mockImplementation(({ range }: { range: string }) => {
      if (range === 'Inbox!A1:G1') {
        return Promise.resolve({
          data: {
            values: [[
              'participantPnIdentifier',
              'spreadsheetId',
              'connectionId',
              'lastMessageAt',
              'lastMessagePreview',
              'kemCiphertext',
              'threadType',
            ]],
          },
        });
      }
      if (range === 'Inbox!A1:H1') {
        return Promise.resolve({
          data: {
            values: [[
              'participantPnIdentifier',
              'spreadsheetId',
              'connectionId',
              'lastMessageAt',
              'lastMessagePreview',
              'kemCiphertext',
              'threadType',
              'wrappedMessageRootKey',
            ]],
          },
        });
      }
      if (range === 'Inbox!A2:H') {
        return Promise.resolve({
          data: {
            values: [
              ['pn-other', 'sheet-old', 'conn-1', '2020-01-01T00:00:00.000Z', '', '', 'dm', ''],
              ['pn-new', 'sheet-new', 'conn-2', '2021-01-01T00:00:00.000Z', '', '', 'dm', ''],
            ],
          },
        });
      }
      return Promise.resolve({ data: { values: [] } });
    });

    await MessageSheetsService.updateInboxEntry(
      token,
      'inbox-sheet-update-test',
      'pn-new',
      'sheet-new',
      'conn-2',
      '2025-01-01T00:00:00.000Z',
      'pn-test',
      'acct-1',
      'preview',
      'kem',
      'wrapped'
    );

    expect(mockClear).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('appendMessage reuses cached Messages tab gid without second spreadsheets.get', async () => {
    await MessageSheetsService.appendMessage(
      token,
      'sheet-conv-1234567890',
      {
        messageId: 'm1',
        fromPnIdentifier: 'pn-a',
        toPnIdentifier: 'pn-b',
        content: '',
        encryptedContent: 'cipher',
        cryptoVersion: 2,
        timestamp: '2025-01-01T00:00:00.000Z',
        read: false,
      },
      'conn',
      '',
      'pn-a',
      'acct-1'
    );
    await MessageSheetsService.appendMessage(
      token,
      'sheet-conv-1234567890',
      {
        messageId: 'm2',
        fromPnIdentifier: 'pn-a',
        toPnIdentifier: 'pn-b',
        content: '',
        encryptedContent: 'cipher2',
        cryptoVersion: 2,
        timestamp: '2025-01-02T00:00:00.000Z',
        read: false,
      },
      'conn',
      '',
      'pn-a',
      'acct-1'
    );

    expect(mockSpreadsheetsGet).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
  });

  it('getInboxThreadsSortedByDrive sorts DMs by Drive modifiedTime', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        values: [
          ['pn-a', 'sheet-a', 'conn-a', '2020-01-01T00:00:00.000Z', '', 'kem-a', 'dm', ''],
          ['group-1', 'sheet-g', 'pn-owner', '2020-01-01T00:00:00.000Z', '', '', 'group', ''],
        ],
      },
    });
    mockDriveFilesList.mockResolvedValueOnce({
      data: {
        files: [
          {
            id: 'sheet-b',
            name: 'conversation-pn-b',
            modifiedTime: '2025-06-01T00:00:00.000Z',
          },
          {
            id: 'sheet-a',
            name: 'conversation-pn-a',
            modifiedTime: '2025-05-01T00:00:00.000Z',
          },
        ],
      },
    });
    mockDriveFilesGet.mockResolvedValueOnce({
      data: { modifiedTime: '2025-07-01T00:00:00.000Z' },
    });

    const threads = await MessageSheetsService.getInboxThreadsSortedByDrive(
      token,
      'msg-folder',
      'inbox-sheet',
      'pn-test',
      'acct-1',
      async () => ({
        token,
        accountId: 'acct-owner',
      })
    );

    expect(threads[0].threadType).toBe('group');
    expect(threads[0].lastMessageAt).toBe('2025-07-01T00:00:00.000Z');
    expect(threads[1].participantPnIdentifier).toBe('pn-a');
    expect(threads[1].lastMessageAt).toBe('2025-05-01T00:00:00.000Z');
  });
});
