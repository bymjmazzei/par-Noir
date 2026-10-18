/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

jest.mock('./deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { driveUpload: 'drive.upload' },
  requireFirstPartyOAuthClient: () => true,
  gateFirstPartyOwnerRoute: async () => ({ isKeyed: true }),
}));

const mockEnqueue = jest.fn(async (_job: unknown) => true);
jest.mock('./socialRail', () => ({
  enqueueSocialJob: (job: unknown) => mockEnqueue(job),
}));

const mockInsert = jest.fn(async () => ({ inserted: true }));
const mockReadStructure = jest.fn(async () => ({
  widgetId: 'doc-1:g1',
  docId: 'doc-1',
  ownerPnHash: 'owner-hash',
  kind: 'poll' as const,
  structure: {
    question: 'What next?',
    options: [
      { id: 'a', label: 'A' },
      { id: 'other', label: 'Other', writeIn: true },
    ],
    closesAt: null,
  },
  revealPolicy: 'after_response' as const,
  closesAt: null,
  spreadsheetId: 'sheet-1',
}));

jest.mock('./widgetCache', () => ({
  readWidgetStructure: (...args: unknown[]) => mockReadStructure(...args),
  insertWidgetResponse: (...args: unknown[]) => mockInsert(...args),
  buildWidgetView: async () => ({
    widgetId: 'doc-1:g1',
    phase: 'results',
    revealPolicy: 'after_response',
    closesAt: null
  }),
  pollCountsFromResponses: async () => ({ total: 1, byOption: { other: 1 } }),
  structureRejectsVote: () => null,
  upsertWidgetStructure: jest.fn()
}));

import express from 'express';
import request from 'supertest';
import { setupWidgetRoutes } from './widgetRoutes';

function app() {
  const server = express();
  server.use(express.json());
  setupWidgetRoutes(server);
  return server;
}

const base = {
  userPnIdentifier: 'pn-voter',
  ownerPnIdentifier: 'pn-owner',
  widgetId: 'doc-1:g1',
  responseId: 'vote-1',
  respondKind: 'vote',
};

describe('POST /api/pen/widgets/respond write-in', () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    mockInsert.mockClear();
  });

  it('seals the normalized answer for the owner', async () => {
    const res = await request(app())
      .post('/api/pen/widgets/respond')
      .send({ ...base, optionId: 'other', writeIn: '  Dark   mode ' });
    expect(res.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'pen.poll_vote',
        peerPn: 'pn-owner',
        sealed: expect.objectContaining({ optionId: 'other', writeIn: 'Dark mode', widgetId: 'doc-1:g1' }),
      })
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        responseId: 'vote-1',
        widgetId: 'doc-1:g1',
        payload: expect.objectContaining({ optionId: 'other', writeIn: 'Dark mode' }),
      })
    );
  });

  it('rejects empty write-in on write-in option', async () => {
    const empty = await request(app())
      .post('/api/pen/widgets/respond')
      .send({ ...base, optionId: 'other', writeIn: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('write_in_required');
  });
});
