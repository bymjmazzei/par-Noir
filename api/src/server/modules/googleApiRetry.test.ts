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

  it('treats Google API timeout as retryable', () => {
    expect(isRetryableGoogleError(new Error('Google API timeout after 45000ms (sheets:create)'))).toBe(
      true
    );
  });

  it('withAttemptTimeout rejects after deadline', async () => {
    const { withAttemptTimeout } = await import('./googleApiRetry');
    await expect(
      withAttemptTimeout('slow', 30, () => new Promise((r) => setTimeout(r, 500)))
    ).rejects.toMatchObject({ message: expect.stringContaining('timeout after 30ms') });
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
