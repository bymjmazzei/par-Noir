/**
 * POST /api/pen/widgets/action — viewer press on a published widget enqueues a
 * sealed pen.widget_action row for the post owner.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false
}));

jest.mock('./deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { driveUpload: 'drive.upload' },
  requireFirstPartyOAuthClient: () => true,
  gateFirstPartyOwnerRoute: async () => true
}));

const enqueueSocialJob = jest.fn();
jest.mock('./socialRail', () => ({
  enqueueSocialJob: (...args: unknown[]) => enqueueSocialJob(...args)
}));

jest.mock('@par-noir/pen-protocol', () => ({
  hashPnIdentifier: (pn: string) => `pnhash:${pn.length}:${[...pn].reverse().join('')}`,
  isSheetTrigger: (t: string) =>
    ['widget.toggle', 'widget.stamp', 'widget.rank', 'widget.allocate'].includes(t)
}));

jest.mock('./pollVoteCache', () => ({
  insertPollVoteCache: jest.fn(),
  pollCounts: jest.fn(),
  readPollStructureCache: jest.fn(),
  structureRejectsVote: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { setupPollVoteRoutes } from './pollVoteRoutes';

function buildApp() {
  const app = express();
  app.use(express.json());
  setupPollVoteRoutes(app);
  return app;
}

const base = {
  userPnIdentifier: 'viewer-pn',
  ownerPnIdentifier: 'owner-pn',
  spreadsheetId: 'sheet-1',
  docId: 'doc-1'
};

describe('POST /api/pen/widgets/action', () => {
  beforeEach(() => {
    enqueueSocialJob.mockReset();
    enqueueSocialJob.mockResolvedValue(true);
  });

  it('rejects missing fields', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/action')
      .send({ ...base, spreadsheetId: '', row: { actionId: 'a1', trigger: 'widget.toggle' } });
    expect(res.status).toBe(400);
    expect(enqueueSocialJob).not.toHaveBeenCalled();
  });

  it('rejects a trigger that is not a widget write', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/action')
      .send({ ...base, row: { actionId: 'a1', trigger: 'poll.vote' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('widget_trigger_invalid');
  });

  it('rejects malformed cells', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/action')
      .send({ ...base, row: { actionId: 'a1', trigger: 'widget.rank', cells: [1, 2] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('widget_row_invalid');
  });

  it('enqueues pen.widget_action for the owner with a hashed actor', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/action')
      .send({
        ...base,
        row: {
          actionId: 'a1',
          trigger: 'widget.rank',
          actorId: 'spoofed',
          headers: ['A', 'B'],
          cells: ['2', '1']
        }
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, enqueued: true });
    expect(enqueueSocialJob).toHaveBeenCalledTimes(1);
    const job = enqueueSocialJob.mock.calls[0][0];
    expect(job.jobType).toBe('pen.widget_action');
    expect(job.peerPn).toBe('owner-pn');
    expect(job.requestId).toBe('a1');
    expect(job.sealed).toMatchObject({
      docId: 'doc-1',
      spreadsheetId: 'sheet-1',
      actionId: 'a1',
      trigger: 'widget.rank',
      actorId: 'pnhash:9:np-reweiv',
      headers: ['A', 'B'],
      cells: ['2', '1']
    });
    expect(JSON.stringify(job.sealed)).not.toContain('viewer-pn');
  });
});
