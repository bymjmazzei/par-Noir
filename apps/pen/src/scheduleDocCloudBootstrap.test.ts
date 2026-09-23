/**
 * Local-first create schedules bootstrap via sync queue — does not await cloud.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueueSyncJob = vi.fn((pn: string, job: Record<string, unknown>) => ({
  id: 'sync_test',
  createdAt: new Date().toISOString(),
  attempts: 0,
  ...job
}));

vi.mock('./services/penSyncQueue', () => ({
  enqueueSyncJob: (...args: unknown[]) => enqueueSyncJob(...(args as [string, Record<string, unknown>])),
  listSyncJobs: vi.fn(() => []),
  markSyncJobFailed: vi.fn(),
  removeSyncJob: vi.fn()
}));

vi.mock('./services/penCloudStore', () => ({
  bootstrapDocCloud: vi.fn(),
  publishDocCloud: vi.fn(),
  upsertDraftCloud: vi.fn()
}));

vi.mock('./services/penCollab', () => ({
  applyPenCommentInbound: vi.fn(),
  applyPenSuggestionInbound: vi.fn(),
  promotePenOutboxAndFanout: vi.fn().mockResolvedValue(undefined)
}));

import { scheduleDocCloudBootstrap } from './services/penSyncFlush';

describe('scheduleDocCloudBootstrap', () => {
  beforeEach(() => {
    enqueueSyncJob.mockClear();
  });

  it('enqueues bootstrap and returns without awaiting cloud', () => {
    const session = { accessToken: 't', pnIdentifier: 'pn-test' };
    const bundle = {
      manifest: { docId: 'pen_abc', groupId: 'g1' },
      sections: [],
      chain: { docId: 'pen_abc', genesis: {}, links: [] }
    };
    const draft = {
      draftId: 'draft_1',
      docId: 'pen_abc',
      authorPnHash: 'h',
      createdAt: 't',
      updatedAt: 't',
      status: 'unfinished' as const,
      toc: ['body']
    };

    scheduleDocCloudBootstrap({
      session: session as never,
      bundle: bundle as never,
      draft: draft as never
    });

    expect(enqueueSyncJob).toHaveBeenCalledWith(
      'pn-test',
      expect.objectContaining({
        kind: 'bootstrap',
        docId: 'pen_abc',
        payload: { bundle, draft }
      })
    );
  });
});
