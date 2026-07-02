/**
 * @jest-environment node
 */
import { ensureIndexSheetInFolder, isGoogleSheetsPerMinuteQuota, isRetryableGoogleError } from './googleApiRetry';

jest.mock('./indexSheetsService', () => ({
  IndexSheetsService: {
    getIndexSheet: jest.fn(),
    createIndexSheet: jest.fn(),
  },
}));

import { IndexSheetsService } from './indexSheetsService';

const mockGet = IndexSheetsService.getIndexSheet as jest.MockedFunction<
  typeof IndexSheetsService.getIndexSheet
>;
const mockCreate = IndexSheetsService.createIndexSheet as jest.MockedFunction<
  typeof IndexSheetsService.createIndexSheet
>;

const token = { access_token: 't' };

describe('googleApiRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats DRIVE_LAYOUT_INCOMPLETE as retryable', () => {
    const err = Object.assign(new Error('layout incomplete'), { code: 'DRIVE_LAYOUT_INCOMPLETE' });
    expect(isRetryableGoogleError(err)).toBe(true);
  });

  it('does not retry per-minute Sheets quota (429)', () => {
    const err = Object.assign(new Error("Quota exceeded for quota metric 'Read requests'"), { code: 429 });
    expect(isGoogleSheetsPerMinuteQuota(err)).toBe(true);
    expect(isRetryableGoogleError(err)).toBe(false);
  });

  it('ensureIndexSheetInFolder retries create after not found', async () => {
    mockGet.mockRejectedValueOnce(new Error('Sheet not found'));
    mockCreate.mockResolvedValueOnce('new-sheet-id');

    const id = await ensureIndexSheetInFolder(
      'test',
      token,
      'folder-1',
      'owner',
      'pn-abc',
      undefined,
      'media'
    );

    expect(id).toBe('new-sheet-id');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
