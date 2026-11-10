/**
 * @jest-environment node
 */
/**
 * Gate-order and classify tests for publish safety (prohibited / nsfw).
 */
import { applyPublishSafetyGate, isMetadataProhibited } from './publishSafetyGate';
import type { ModerationPreview } from './moderationPreview';

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

const imagePreview = (): Promise<ModerationPreview> =>
  Promise.resolve({ kind: 'image', buffer: Buffer.from('fake'), mimeType: 'image/jpeg' });

describe('isMetadataProhibited', () => {
  it('detects boolean and string true', () => {
    expect(isMetadataProhibited({ isProhibited: true })).toBe(true);
    expect(isMetadataProhibited({ isProhibited: 'true' })).toBe(true);
    expect(isMetadataProhibited({ isProhibited: false })).toBe(false);
    expect(isMetadataProhibited(null)).toBe(false);
  });
});

describe('applyPublishSafetyGate short-circuit', () => {
  it('short-circuits when existingIsProhibited without loading the preview', async () => {
    const loadPreview = jest.fn(imagePreview);
    const outcome = await applyPublishSafetyGate({
      loadPreview,
      ownerPnIdentifier: 'pn-test',
      fileId: 'file-1',
      existingIsProhibited: true,
    });
    expect(outcome.status).toBe('prohibited');
    expect(loadPreview).not.toHaveBeenCalled();
  });

  it('skips classify when skip=true', async () => {
    const loadPreview = jest.fn(imagePreview);
    const outcome = await applyPublishSafetyGate({
      loadPreview,
      ownerPnIdentifier: 'pn-test',
      fileId: 'file-2',
      skip: true,
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: false });
    expect(loadPreview).not.toHaveBeenCalled();
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
    const classifyPublishLane = jest.fn(async () => ({ lane: 'nsfw', reason: 'adult', confidence: 0.9 }));
    getGeminiModerationService.mockReturnValue({ classifyPublishLane, classifyPublishLaneSampled: jest.fn() });
    const outcome = await applyPublishSafetyGate({
      loadPreview: imagePreview,
      ownerPnIdentifier: 'pn-a',
      fileId: 'f1',
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: true });
    expect(classifyPublishLane).toHaveBeenCalledWith(Buffer.from('fake'), 'image/jpeg');
    expect(addContentNotice).not.toHaveBeenCalled();
  });

  it('marks prohibited and does not call Prism (caller responsibility)', async () => {
    getGeminiModerationService.mockReturnValue({
      classifyPublishLane: jest.fn(async () => ({ lane: 'prohibited', reason: 'illegal', confidence: 0.95 })),
      classifyPublishLaneSampled: jest.fn(),
    });
    const outcome = await applyPublishSafetyGate({
      loadPreview: imagePreview,
      ownerPnIdentifier: 'pn-a',
      fileId: 'f2',
    });
    expect(outcome.status).toBe('prohibited');
    expect(addContentNotice).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'f2', type: 'prohibited', source: 'bot' })
    );
  });

  it('does not classify audio (no visual preview)', async () => {
    const classifyPublishLane = jest.fn();
    getGeminiModerationService.mockReturnValue({ classifyPublishLane, classifyPublishLaneSampled: jest.fn() });
    const outcome = await applyPublishSafetyGate({
      loadPreview: async () => ({ kind: 'audio' }),
      ownerPnIdentifier: 'pn-a',
      fileId: 'f3',
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: false });
    expect(classifyPublishLane).not.toHaveBeenCalled();
  });
});
