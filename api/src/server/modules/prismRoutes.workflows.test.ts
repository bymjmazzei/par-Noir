/**
 * @jest-environment node
 */
/**
 * Headless Prism route/workflow coverage (mocked deps).
 * Covers reports → queue → vote (incl. prohibited deny), reputation, apply, admin.
 */
import express from 'express';
import request from 'supertest';

const authPayload: { pnIdentifier: string | null } = { pnIdentifier: 'ray-pn' };

const addToPrismQueue = jest.fn(async () => 'queue-1');
const getPendingQueueItemsForRay = jest.fn(async () => [
  {
    id: 'q1',
    file_id: 'file-1',
    owner_pn_identifier: 'owner-pn',
    flag_source: 'user_report',
    reporter_pn_identifier: 'reporter-pn',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    report_type: 'copyright',
  },
]);
const submitVote = jest.fn(async () => ({ resolved: false }));
const getQueueItemById = jest.fn(async () => null as any);
const getQueueStats = jest.fn(async () => ({ pending: 1, approved: 0, denied: 0 }));
const seedDemoQueueItems = jest.fn(async () => ({ added: 2, fileIds: ['a', 'b'] }));
const getFileMetadata = jest.fn(async () => ({
  pnIdentifier: 'owner-pn',
  metadata: { name: 'demo.mp4', mimeType: 'video/mp4', isPublic: true },
}));
const getReputationScore = jest.fn(async () => ({
  score: 80,
  eligible: true,
  breakdown: {},
}));
const submitRayApplication = jest.fn(async () => ({
  applied: true,
  applicationId: 'app-1',
}));
const isPrismAdmin = jest.fn(() => false);
const isBootstrapMode = jest.fn(() => false);
const executeTakedown = jest.fn(async () => ({ ok: true }));
const markContentProhibited = jest.fn(async () => undefined);
const recordPrismEntry = jest.fn(async () => undefined);

jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: () =>
    authPayload.pnIdentifier ? { pnIdentifier: authPayload.pnIdentifier } : null,
}));

jest.mock('./prismQueueService', () => ({
  addToPrismQueue: (...args: unknown[]) => addToPrismQueue(...args),
  getPendingQueueItems: jest.fn(),
  getPendingQueueItemsForRay: (...args: unknown[]) => getPendingQueueItemsForRay(...args),
  submitVote: (...args: unknown[]) => submitVote(...args),
  getQueueStats: (...args: unknown[]) => getQueueStats(...args),
  seedDemoQueueItems: (...args: unknown[]) => seedDemoQueueItems(...args),
  getQueueItemById: (...args: unknown[]) => getQueueItemById(...args),
}));

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({ getFileMetadata }),
  },
}));

jest.mock('./prismLedgerService', () => ({
  recordPrismEntry: (...args: unknown[]) => recordPrismEntry(...args),
}));

jest.mock('./prismAdminService', () => ({
  isPrismAdmin: (...args: unknown[]) => isPrismAdmin(...args),
  isBootstrapMode: (...args: unknown[]) => isBootstrapMode(...args),
}));

jest.mock('./prismReputationService', () => ({
  getReputationScore: (...args: unknown[]) => getReputationScore(...args),
  submitRayApplication: (...args: unknown[]) => submitRayApplication(...args),
}));

jest.mock('./dmcaTakedownService', () => ({
  executeTakedown: (...args: unknown[]) => executeTakedown(...args),
}));

jest.mock('./publishSafetyGate', () => ({
  markContentProhibited: (...args: unknown[]) => markContentProhibited(...args),
}));

jest.mock('./ownerDriveToken', () => ({
  extractCloudAccessToken: () => '',
  resolveOwnerDriveToken: jest.fn(),
  respondDriveTokenError: () => false,
}));

jest.mock('./googleDriveProxy', () => ({
  googleDriveProxyService: {
    downloadFile: jest.fn(),
  },
}));

import { setupPrismRoutes } from './prismRoutes';

describe('Prism workflows and routes (headless)', () => {
  const app = express();
  app.use(express.json());
  setupPrismRoutes(app);

  beforeEach(() => {
    jest.clearAllMocks();
    authPayload.pnIdentifier = 'ray-pn';
    isPrismAdmin.mockReturnValue(false);
    isBootstrapMode.mockReturnValue(false);
    getFileMetadata.mockResolvedValue({
      pnIdentifier: 'owner-pn',
      metadata: { name: 'demo.mp4', mimeType: 'video/mp4', isPublic: true },
    });
    getPendingQueueItemsForRay.mockResolvedValue([
      {
        id: 'q1',
        file_id: 'file-1',
        owner_pn_identifier: 'owner-pn',
        flag_source: 'user_report',
        reporter_pn_identifier: 'reporter-pn',
        status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        report_type: 'copyright',
      },
    ]);
    submitVote.mockResolvedValue({ resolved: false });
    getQueueItemById.mockResolvedValue(null);
    getReputationScore.mockResolvedValue({ score: 80, eligible: true, breakdown: {} });
    submitRayApplication.mockResolvedValue({ applied: true, applicationId: 'app-1' });
    getQueueStats.mockResolvedValue({ pending: 1, approved: 0, denied: 0 });
    seedDemoQueueItems.mockResolvedValue({ added: 2, fileIds: ['a', 'b'] });
    executeTakedown.mockResolvedValue({ ok: true });
  });

  describe('auth gate', () => {
    it('returns 401 when unauthenticated on queue', async () => {
      authPayload.pnIdentifier = null;
      const res = await request(app).get('/api/prism/queue');
      expect(res.status).toBe(401);
    });

    it('returns 401 when unauthenticated on vote', async () => {
      authPayload.pnIdentifier = null;
      const res = await request(app).post('/api/prism/vote').send({ queueItemId: 'q1', vote: 'approve' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when unauthenticated on reports', async () => {
      authPayload.pnIdentifier = null;
      const res = await request(app)
        .post('/api/reports')
        .send({ fileId: 'f1', reportType: 'copyright' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/reports', () => {
    it('enqueues copyright reports', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ fileId: 'file-xyz', reportType: 'copyright' });
      expect(res.status).toBe(200);
      expect(addToPrismQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-xyz',
          reportType: 'copyright',
          flagSource: 'user_report',
        })
      );
    });

    it('enqueues prohibited reports', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ fileId: 'file-xyz', reportType: 'prohibited' });
      expect(res.status).toBe(200);
      expect(addToPrismQueue).toHaveBeenCalledWith(
        expect.objectContaining({ reportType: 'prohibited' })
      );
    });

    it('accepts nsfw/spam/other without queueing', async () => {
      for (const reportType of ['nsfw', 'spam', 'other'] as const) {
        addToPrismQueue.mockClear();
        const res = await request(app)
          .post('/api/reports')
          .send({ fileId: 'file-xyz', reportType });
        expect(res.status).toBe(200);
        expect(addToPrismQueue).not.toHaveBeenCalled();
      }
    });

    it('404 when file missing for copyright', async () => {
      getFileMetadata.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/reports')
        .send({ fileId: 'missing', reportType: 'copyright' });
      expect(res.status).toBe(404);
    });

    it('400 when fields missing or invalid', async () => {
      expect((await request(app).post('/api/reports').send({})).status).toBe(400);
      expect(
        (await request(app).post('/api/reports').send({ fileId: 'f', reportType: 'nope' })).status
      ).toBe(400);
    });
  });

  describe('GET /api/prism/queue', () => {
    it('returns enriched pending items for Ray', async () => {
      const res = await request(app).get('/api/prism/queue?limit=10');
      expect(res.status).toBe(200);
      expect(getPendingQueueItemsForRay).toHaveBeenCalledWith('ray-pn', 10);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        id: 'q1',
        file_id: 'file-1',
        name: 'demo.mp4',
        mimeType: 'video/mp4',
      });
    });
  });

  describe('POST /api/prism/vote', () => {
    it('rejects invalid vote body', async () => {
      const res = await request(app).post('/api/prism/vote').send({ queueItemId: 'q1', vote: 'maybe' });
      expect(res.status).toBe(400);
    });

    it('records approve without takedown when not resolved', async () => {
      submitVote.mockResolvedValueOnce({ resolved: false });
      getQueueItemById.mockResolvedValueOnce({
        id: 'q1',
        file_id: 'file-1',
        owner_pn_identifier: 'owner-pn',
        report_type: 'copyright',
      });
      const res = await request(app)
        .post('/api/prism/vote')
        .send({ queueItemId: 'q1', vote: 'approve' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, resolved: false });
      expect(executeTakedown).not.toHaveBeenCalled();
      expect(markContentProhibited).not.toHaveBeenCalled();
    });

    it('on copyright deny consensus: takedown only', async () => {
      submitVote.mockResolvedValueOnce({ resolved: true, status: 'denied' });
      getQueueItemById.mockResolvedValueOnce({
        id: 'q1',
        file_id: 'file-1',
        owner_pn_identifier: 'owner-pn',
        report_type: 'copyright',
      });
      const res = await request(app)
        .post('/api/prism/vote')
        .send({ queueItemId: 'q1', vote: 'deny' });
      expect(res.status).toBe(200);
      expect(executeTakedown).toHaveBeenCalledWith(
        'file-1',
        'Prism review: content denied (copyright).',
        'prism_denied'
      );
      expect(markContentProhibited).not.toHaveBeenCalled();
    });

    it('on prohibited deny consensus: takedown + mark prohibited', async () => {
      submitVote.mockResolvedValueOnce({ resolved: true, status: 'denied' });
      getQueueItemById.mockResolvedValueOnce({
        id: 'q1',
        file_id: 'file-proh',
        owner_pn_identifier: 'owner-pn',
        report_type: 'prohibited',
      });
      const res = await request(app)
        .post('/api/prism/vote')
        .send({ queueItemId: 'q1', vote: 'deny' });
      expect(res.status).toBe(200);
      expect(executeTakedown).toHaveBeenCalledWith(
        'file-proh',
        'Prism review: content denied (prohibited).',
        'prism_denied'
      );
      expect(markContentProhibited).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-proh',
          ownerPnIdentifier: 'owner-pn',
          source: 'prism_denied',
        })
      );
    });

    it('accepts skip vote', async () => {
      submitVote.mockResolvedValueOnce({ resolved: false });
      const res = await request(app)
        .post('/api/prism/vote')
        .send({ queueItemId: 'q1', vote: 'skip' });
      expect(res.status).toBe(200);
      expect(submitVote).toHaveBeenCalledWith('q1', 'ray-pn', 'skip');
    });
  });

  describe('GET /api/prism/preview', () => {
    it('400 without ownerPn/fileId', async () => {
      const res = await request(app).get('/api/prism/preview');
      expect(res.status).toBe(400);
    });

    it('409 without cloud access token', async () => {
      const res = await request(app).get('/api/prism/preview?ownerPn=other-pn&fileId=f1');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('cloud_token_required');
    });
  });

  describe('reputation and apply', () => {
    it('GET /api/prism/reputation', async () => {
      const res = await request(app).get('/api/prism/reputation');
      expect(res.status).toBe(200);
      expect(res.body.score).toBe(80);
      expect(getReputationScore).toHaveBeenCalledWith('ray-pn');
    });

    it('POST /api/prism/apply success', async () => {
      const res = await request(app).post('/api/prism/apply');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, applicationId: 'app-1' });
    });

    it('POST /api/prism/apply ineligible', async () => {
      submitRayApplication.mockResolvedValueOnce({ applied: false, reason: 'ineligible' });
      const res = await request(app).post('/api/prism/apply');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('ineligible');
    });
  });

  describe('admin routes', () => {
    it('admin/check returns flags', async () => {
      isPrismAdmin.mockReturnValueOnce(true);
      isBootstrapMode.mockReturnValueOnce(true);
      const res = await request(app).get('/api/prism/admin/check');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isAdmin: true, isBootstrapMode: true });
    });

    it('admin/stats requires admin', async () => {
      isPrismAdmin.mockReturnValue(false);
      expect((await request(app).get('/api/prism/admin/stats')).status).toBe(403);
    });

    it('admin/stats returns queue stats for admin', async () => {
      isPrismAdmin.mockReturnValue(true);
      const res = await request(app).get('/api/prism/admin/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ pending: 1, approved: 0, denied: 0 });
    });

    it('admin/seed-demo requires admin', async () => {
      isPrismAdmin.mockReturnValue(false);
      expect((await request(app).post('/api/prism/admin/seed-demo')).status).toBe(403);
    });

    it('admin/seed-demo seeds for admin', async () => {
      isPrismAdmin.mockReturnValue(true);
      const res = await request(app).post('/api/prism/admin/seed-demo?limit=3');
      expect(res.status).toBe(200);
      expect(seedDemoQueueItems).toHaveBeenCalledWith(3);
      expect(res.body.added).toBe(2);
    });

    it('admin reputation for another pn', async () => {
      isPrismAdmin.mockReturnValue(true);
      const res = await request(app).get('/api/prism/admin/reputation/other-pn');
      expect(res.status).toBe(200);
      expect(getReputationScore).toHaveBeenCalledWith('other-pn');
    });

    it('admin reputation forbidden for non-admin', async () => {
      isPrismAdmin.mockReturnValue(false);
      expect((await request(app).get('/api/prism/admin/reputation/other-pn')).status).toBe(403);
    });
  });
});
