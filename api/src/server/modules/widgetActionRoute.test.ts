/**
 * POST /api/pen/widgets/respond — widget_row enqueues sealed pen.widget_action for owner.
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
    ['widget.toggle', 'widget.stamp', 'widget.rank', 'widget.allocate'].includes(t),
  parseWidgetId: (id: string) => ({ docId: id.split(':')[0], groupLayerId: id.split(':')[1] }),
  normalizeWriteIn: (v: unknown) => String(v ?? '').trim(),
  POLL_WRITE_IN_MAX: 200,
  structureRejectsVote: () => null,
  pollIsClosed: () => false,
  pollResultsFromCounts: () => ({ kind: 'poll', total: 0, options: [] }),
  widgetViewPhase: () => 'results',
  emptyPollCounts: () => ({ total: 0, byOption: {} })
}));

const mockInsert = jest.fn(async () => ({ inserted: true }));
jest.mock('./widgetCache', () => ({
  readWidgetStructure: async () => ({
    widgetId: 'doc-1:g1',
    docId: 'doc-1',
    ownerPnHash: 'owner-hash',
    kind: 'rank',
    structure: { question: '', options: [], closesAt: null },
    revealPolicy: 'after_response',
    closesAt: null,
    spreadsheetId: 'sheet-1'
  }),
  insertWidgetResponse: (...args: unknown[]) => mockInsert(...args),
  buildWidgetView: async () => ({ widgetId: 'doc-1:g1', phase: 'results', revealPolicy: 'after_response', closesAt: null }),
  pollCountsFromResponses: async () => ({ total: 0, byOption: {} }),
  upsertWidgetStructure: jest.fn(),
  structureRejectsVote: () => null
}));

import express from 'express';
import request from 'supertest';
import { setupWidgetRoutes } from './widgetRoutes';

function buildApp() {
  const app = express();
  app.use(express.json());
  setupWidgetRoutes(app);
  return app;
}

const base = {
  userPnIdentifier: 'viewer-pn',
  ownerPnIdentifier: 'owner-pn',
  widgetId: 'doc-1:g1',
  responseId: 'a1',
  respondKind: 'widget_row'
};

describe('POST /api/pen/widgets/respond widget_row', () => {
  beforeEach(() => {
    enqueueSocialJob.mockReset();
    enqueueSocialJob.mockResolvedValue(true);
    mockInsert.mockClear();
  });

  it('rejects invalid trigger', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/respond')
      .send({
        ...base,
        row: { actionId: 'a1', trigger: 'poll.vote' }
      });
    expect(res.status).toBe(400);
    expect(enqueueSocialJob).not.toHaveBeenCalled();
  });

  it('enqueues pen.widget_action for the owner with a hashed actor', async () => {
    const res = await request(buildApp())
      .post('/api/pen/widgets/respond')
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
    expect(enqueueSocialJob).toHaveBeenCalledTimes(1);
    const job = enqueueSocialJob.mock.calls[0][0];
    expect(job.jobType).toBe('pen.widget_action');
    expect(job.peerPn).toBe('owner-pn');
    expect(job.sealed).toMatchObject({
      docId: 'doc-1',
      spreadsheetId: 'sheet-1',
      widgetId: 'doc-1:g1',
      actionId: 'a1',
      trigger: 'widget.rank',
      actorId: 'pnhash:12:np-reweiv-np',
      headers: ['A', 'B'],
      cells: ['2', '1']
    });
  });
});
