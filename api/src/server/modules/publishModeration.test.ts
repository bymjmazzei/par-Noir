/**
 * @jest-environment node
 */
import { runPublishModeration } from './publishModeration';
import { loadModerationPreview } from './moderationPreview';

jest.mock('./geminiModerationService', () => ({
  getGeminiModerationService: jest.fn(),
}));

jest.mock('./mediaSamplingService', () => ({
  getMediaDuration: jest.fn(async () => 0),
  extractRandomClips: jest.fn(async () => []),
}));

jest.mock('./contentNoticesService', () => ({
  addContentNotice: jest.fn(async () => 'notice-1'),
}));

jest.mock('./prismQueueService', () => ({
  isFileApprovedByPrism: jest.fn(async () => false),
  addToPrismQueue: jest.fn(async () => 'queue-1'),
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
  getDatabasePool: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));

jest.mock('./feedPreviewR2', () => ({
  feedR2GetBytes: jest.fn(async () => Buffer.from('poster-bytes')),
}));

jest.mock('./publicBlobAccess', () => ({
  fetchPublicBytesTimed: jest.fn(async () => ({ buffer: Buffer.from('public-bytes') })),
}));

const { getGeminiModerationService } = require('./geminiModerationService') as {
  getGeminiModerationService: jest.Mock;
};
const { addToPrismQueue } = require('./prismQueueService') as { addToPrismQueue: jest.Mock };
const { feedR2GetBytes } = require('./feedPreviewR2') as { feedR2GetBytes: jest.Mock };
const { fetchPublicBytesTimed } = require('./publicBlobAccess') as { fetchPublicBytesTimed: jest.Mock };

const poster = { r2Key: 'feed/f1/poster.jpg', contentType: 'image/jpeg', byteSize: 10 };

function mockGemini(overrides: Record<string, jest.Mock> = {}) {
  const gemini = {
    classifyPublishLane: jest.fn(async () => ({ lane: 'public', confidence: 0.9 })),
    classifyPublishLaneSampled: jest.fn(),
    checkDMCA: jest.fn(async () => ({ flagged: false })),
    checkDMCASampled: jest.fn(),
    ...overrides,
  };
  getGeminiModerationService.mockReturnValue(gemini);
  return gemini;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadModerationPreview', () => {
  it('reads the poster from R2 for public images', async () => {
    const preview = await loadModerationPreview({ fileType: 'image', feedPoster: poster });
    expect(preview).toEqual({ kind: 'image', buffer: Buffer.from('poster-bytes'), mimeType: 'image/jpeg' });
    expect(feedR2GetBytes).toHaveBeenCalledWith('feed/f1/poster.jpg');
  });

  it('falls back to the owner public URL when the R2 object is cold', async () => {
    feedR2GetBytes.mockResolvedValueOnce(null);
    const sd = {
      r2Key: 'feed/f1/sd.mp4',
      ownerPublicUrl: 'https://drive.google.com/uc?id=x',
      ownerObjectId: 'x',
      contentType: 'video/mp4',
      byteSize: 10,
    };
    const preview = await loadModerationPreview({ mimeType: 'video/mp4', feedPoster: poster, feedPreviewSd: sd });
    expect(preview).toEqual({ kind: 'video', buffer: Buffer.from('public-bytes'), mimeType: 'video/mp4' });
    expect(fetchPublicBytesTimed).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 'x', publicUrl: 'https://drive.google.com/uc?id=x' })
    );
  });

  it('returns audio for audio posts and none for preview-less documents', async () => {
    await expect(loadModerationPreview({ mimeType: 'audio/mpeg' })).resolves.toEqual({ kind: 'audio' });
    await expect(loadModerationPreview({ mimeType: 'application/pdf' })).resolves.toEqual({ kind: 'none' });
  });

  it('throws when public visual media has no preview', async () => {
    await expect(loadModerationPreview({ fileType: 'image' })).rejects.toThrow(/no feed preview/);
  });
});

describe('runPublishModeration', () => {
  it('classifies the public preview and passes clean images', async () => {
    const gemini = mockGemini();
    const outcome = await runPublishModeration({
      ownerPnIdentifier: 'pn-a',
      fileId: 'f1',
      metadata: { fileType: 'image', feedPoster: poster },
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: false });
    expect(gemini.classifyPublishLane).toHaveBeenCalledWith(Buffer.from('poster-bytes'), 'image/jpeg');
    expect(gemini.checkDMCA).toHaveBeenCalledWith(Buffer.from('poster-bytes'), 'image/jpeg');
    expect(feedR2GetBytes).toHaveBeenCalledTimes(1);
  });

  it('queues audio posts for Prism review', async () => {
    mockGemini();
    const outcome = await runPublishModeration({
      ownerPnIdentifier: 'pn-a',
      fileId: 'a1',
      metadata: { mimeType: 'audio/mpeg' },
    });
    expect(outcome.status).toBe('pending_review');
    expect(addToPrismQueue).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'a1', reportType: 'dmca_bot' }));
  });

  it('queues DMCA-flagged previews for review', async () => {
    mockGemini({ checkDMCA: jest.fn(async () => ({ flagged: true, reason: 'copyrighted' })) });
    const outcome = await runPublishModeration({
      ownerPnIdentifier: 'pn-a',
      fileId: 'f2',
      metadata: { fileType: 'image', feedPoster: poster },
    });
    expect(outcome).toEqual({ status: 'pending_review', reason: 'copyrighted', queueItemId: 'queue-1' });
  });

  it('skips both gates for encrypted notes', async () => {
    const gemini = mockGemini();
    const outcome = await runPublishModeration({
      ownerPnIdentifier: 'pn-a',
      fileId: 'n1',
      metadata: { textPost: { body: 'x' } },
    });
    expect(outcome).toEqual({ status: 'ok', forceNsfw: false });
    expect(gemini.classifyPublishLane).not.toHaveBeenCalled();
    expect(addToPrismQueue).not.toHaveBeenCalled();
  });
});
