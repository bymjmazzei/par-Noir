/**
 * @jest-environment node
 */

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: {
          get: (...args: unknown[]) => mockGet(...args),
          update: (...args: unknown[]) => mockUpdate(...args),
        },
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

import { MessageSheetsService } from './messageSheetsService';

const token = { access_token: 'tok' };

describe('MessageSheetsService messaging quota optimizations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({});
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
});
