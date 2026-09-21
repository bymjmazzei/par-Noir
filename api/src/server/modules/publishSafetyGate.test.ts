/**
 * @jest-environment node
 */
/**
 * Gate-order and classify tests for publish safety (prohibited / nsfw).
 */
import { applyPublishSafetyGate, isMetadataProhibited } from './publishSafetyGate';

jest.mock('./geminiModerationService', () => {
  const actual = jest.requireActual('./geminiModerationService');
  return {
    ...actual,
    getGeminiModerationService: jest.fn(),
  };
});

jest.mock('./mediaSamplingService', () => ({
  getMediaDuration: jest.fn(async () => 0),
  extractRandomClips: jest.fn(async () => []),
}));

jest.mock('./contentNoticesService', () => ({
  addContentNotice: jest.fn(async () => 'notice-1'),
}));

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      getFileMetadata: jest.fn(async () => null),
      updateMetadata: jest.fn(async () => null),
    }),
  },
}));

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async () => ({ rows: [] })),
  }),
}));

describe('isMetadataProhibited', () => {
  it('detects boolean and string true', () => {
    expect(isMetadataProhibited({ isProhibited: true })).toBe(true);
    expect(isMetadataProhibited({ isProhibited: 'true' })).toBe(true);
    expect(isMetadataProhibited({ isProhibited: false })).toBe(false);
    expect(isMetadataProhibited(null)).toBe(false);
  });
});

describe('applyPublishSafetyGate short-circuit', () => {
  it('short-circuits when existingIsProhibited without calling Drive', async () => {
    const downloadFile = jest.fn();
    const outcome = await applyPublishSafetyGate({
      googleDriveProxy: { downloadFile },
      ownerPnIdentifier: 'pn-test',
      fileId: 'file-1',
      driveFileId: 'file-1',
      mimeType: 'image/jpeg',
      existingIsProhibited: true,
    });
    expect(outcome.status).toBe('prohibited');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('skips classify when skip=true', async () => {
    const downloadFile = jest.fn();
    const outcome = await applyPublishSafetyGate({
      googleDriveProxy: { downloadFile },
      ownerPnIdentifier: 'pn-test',
      fileId: 'file-2',
      driveFileId: 'file-2',
      mimeType: 'image/jpeg',
      skip: true,
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: false });
    expect(downloadFile).not.toHaveBeenCalled();
  });
});

describe('publishSafetyGate classify outcomes', () => {
  const { getGeminiModerationService } = require('./geminiModerationService') as {
    getGeminiModerationService: jest.Mock;
  };
  const { addContentNotice } = require('./contentNoticesService') as {
    addContentNotice: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forceNsfw when lane is nsfw and does not mark prohibited', async () => {
    getGeminiModerationService.mockReturnValue({
      classifyPublishLane: jest.fn(async () => ({
        lane: 'nsfw',
        reason: 'adult',
        confidence: 0.9,
      })),
      classifyPublishLaneSampled: jest.fn(),
    });
    const blob = new Blob([Buffer.from('fake')], { type: 'image/jpeg' });
    const downloadFile = jest.fn(async () => blob);
    const outcome = await applyPublishSafetyGate({
      googleDriveProxy: { downloadFile },
      ownerPnIdentifier: 'pn-a',
      fileId: 'f1',
      driveFileId: 'f1',
      mimeType: 'image/jpeg',
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: true });
    expect(addContentNotice).not.toHaveBeenCalled();
  });

  it('marks prohibited and does not call Prism (caller responsibility)', async () => {
    getGeminiModerationService.mockReturnValue({
      classifyPublishLane: jest.fn(async () => ({
        lane: 'prohibited',
        reason: 'illegal',
        confidence: 0.95,
      })),
      classifyPublishLaneSampled: jest.fn(),
    });
    const blob = new Blob([Buffer.from('fake')], { type: 'image/jpeg' });
    const downloadFile = jest.fn(async () => blob);
    const outcome = await applyPublishSafetyGate({
      googleDriveProxy: { downloadFile },
      ownerPnIdentifier: 'pn-a',
      fileId: 'f2',
      driveFileId: 'f2',
      mimeType: 'image/jpeg',
    });
    expect(outcome.status).toBe('prohibited');
    expect(addContentNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'f2',
        type: 'prohibited',
        source: 'bot',
      })
    );
  });
});
