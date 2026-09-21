/**
 * @jest-environment node
 */
/**
 * Report route accepts prohibited and enqueues to Prism.
 */
import express from 'express';
import request from 'supertest';

const addToPrismQueue = jest.fn(async () => 'queue-1');
const getFileMetadata = jest.fn(async () => ({
  pnIdentifier: 'owner-pn',
  metadata: { isPublic: true },
}));

jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: () => ({ pnIdentifier: 'reporter-pn' }),
}));

jest.mock('./prismQueueService', () => ({
  addToPrismQueue: (...args: unknown[]) => addToPrismQueue(...args),
  getPendingQueueItems: jest.fn(),
  getPendingQueueItemsForRay: jest.fn(),
  submitVote: jest.fn(),
  getQueueStats: jest.fn(),
  seedDemoQueueItems: jest.fn(),
  getQueueItemById: jest.fn(),
}));

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({ getFileMetadata }),
  },
}));

jest.mock('./prismLedgerService', () => ({
  recordPrismEntry: jest.fn(async () => undefined),
}));

jest.mock('./prismAdminService', () => ({
  isPrismAdmin: () => false,
  isBootstrapMode: () => false,
}));

jest.mock('./prismReputationService', () => ({
  getReputationScore: jest.fn(),
  submitRayApplication: jest.fn(),
}));

import { setupPrismRoutes } from './prismRoutes';

describe('POST /api/reports prohibited', () => {
  const app = express();
  app.use(express.json());
  setupPrismRoutes(app);

  beforeEach(() => {
    jest.clearAllMocks();
    addToPrismQueue.mockResolvedValue('queue-1');
    getFileMetadata.mockResolvedValue({
      pnIdentifier: 'owner-pn',
      metadata: { isPublic: true },
    });
  });

  it('enqueues prohibited reports with reportType', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ fileId: 'file-xyz', reportType: 'prohibited', reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(addToPrismQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-xyz',
        ownerPnIdentifier: 'owner-pn',
        flagSource: 'user_report',
        reporterPnIdentifier: 'reporter-pn',
        reportType: 'prohibited',
      })
    );
  });

  it('rejects invalid reportType', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ fileId: 'file-xyz', reportType: 'not-a-type' });
    expect(res.status).toBe(400);
    expect(addToPrismQueue).not.toHaveBeenCalled();
  });
});
