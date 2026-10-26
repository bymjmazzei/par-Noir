/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

const mockGate = jest.fn(async () => ({ isKeyed: true }));
const mockRequireClient = jest.fn(() => true);
jest.mock('./deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { driveUpload: 'drive.upload' },
  requireFirstPartyOAuthClient: () => mockRequireClient(),
  gateFirstPartyOwnerRoute: (...args: unknown[]) => mockGate(...(args as [])),
}));

const mockEnqueue = jest.fn(async (_job: unknown) => true);
jest.mock('./socialRail', () => ({
  enqueueSocialJob: (job: unknown) => mockEnqueue(job),
}));

import { hashPnIdentifier } from '@par-noir/pen-protocol';

const mockInsertResponse = jest.fn(async () => ({ inserted: true }));
const mockInsertTap = jest.fn(async (_tap: unknown) => ({ inserted: true }));
const mockReadStructure = jest.fn(async (_widgetId: string) => ({
  widgetId: 'doc-1:taps',
  docId: 'doc-1',
  ownerPnHash: hashPnIdentifier('pn-owner'),
  kind: 'tap' as const,
  structure: { question: '', options: [], closesAt: null },
  revealPolicy: 'after_response' as const,
  closesAt: null,
  spreadsheetId: 'sheet-1',
}));

jest.mock('./widgetCache', () => ({
  readWidgetStructure: (id: string) => mockReadStructure(id),
  insertWidgetResponse: (...args: unknown[]) => mockInsertResponse(...(args as [])),
  insertWidgetTap: (tap: unknown) => mockInsertTap(tap),
  buildWidgetView: async () => null,
  pollCountsFromResponses: async () => ({ total: 0, byOption: {} }),
  upsertWidgetStructure: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { resetTapRateLimit, setupWidgetRoutes } from './widgetRoutes';

function app() {
  const server = express();
  server.use(express.json());
  setupWidgetRoutes(server);
  return server;
}

const row = (actionId: string) => ({
  actionId,
  trigger: 'widget.tap',
  headers: ['button', 'action', 'target'],
  cells: ['Shop', 'open', 'shop.example'],
});

const tap = (extra: Record<string, unknown> = {}) => ({
  ownerPnIdentifier: 'pn-owner',
  widgetId: 'doc-1:taps',
  row: row('tap-00000001'),
  ...extra,
});

describe('POST /api/pen/widgets/tap', () => {
  beforeEach(() => {
    resetTapRateLimit();
    mockEnqueue.mockClear();
    mockInsertTap.mockClear();
    mockInsertResponse.mockClear();
    mockGate.mockClear();
    mockRequireClient.mockClear();
  });

  it('records an anonymous tap with no bearer or pn and seals it for the owner sheet', async () => {
    const res = await request(app()).post('/api/pen/widgets/tap').send(tap());
    expect(res.status).toBe(200);
    expect(mockRequireClient).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockInsertTap).toHaveBeenCalledWith(
      expect.objectContaining({ widgetId: 'doc-1:taps', actorHash: 'anonymous', button: 'Shop', target: 'shop.example' })
    );
    expect(mockInsertResponse).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'pen.widget_action',
        peerPn: 'pn-owner',
        sealed: expect.objectContaining({ trigger: 'widget.tap', actorId: 'anonymous', spreadsheetId: 'sheet-1' }),
      })
    );
  });

  it('stamps a hashed actor for unlocked viewers and drops the owner own taps', async () => {
    await request(app()).post('/api/pen/widgets/tap').send(tap({ userPnIdentifier: 'pn-viewer' }));
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockInsertTap).toHaveBeenCalledWith(expect.objectContaining({ actorHash: hashPnIdentifier('pn-viewer') }));

    mockInsertTap.mockClear();
    const own = await request(app()).post('/api/pen/widgets/tap').send(tap({ userPnIdentifier: 'pn-owner' }));
    expect(own.body.ignored).toBe('owner');
    expect(mockInsertTap).not.toHaveBeenCalled();
  });

  it('matches the owner whether or not browse strips the pn- prefix', async () => {
    const res = await request(app()).post('/api/pen/widgets/tap').send(tap({ ownerPnIdentifier: 'owner' }));
    expect(res.status).toBe(200);
    expect(mockInsertTap).toHaveBeenCalledTimes(1);

    mockInsertTap.mockClear();
    const own = await request(app())
      .post('/api/pen/widgets/tap')
      .send(tap({ ownerPnIdentifier: 'owner', userPnIdentifier: 'owner' }));
    expect(own.body.ignored).toBe('owner');
    expect(mockInsertTap).not.toHaveBeenCalled();
  });

  it('rate limits anonymous taps per IP and widget', async () => {
    const server = app();
    for (let i = 0; i < 30; i += 1) {
      const ok = await request(server).post('/api/pen/widgets/tap').send(tap({ row: row(`tap-${String(i).padStart(8, '0')}`) }));
      expect(ok.status).toBe(200);
    }
    const blocked = await request(server).post('/api/pen/widgets/tap').send(tap({ row: row('tap-99999999') }));
    expect(blocked.status).toBe(429);
  });

  it('refuses a spoofed owner, a non-tap widget, and a malformed row', async () => {
    const spoof = await request(app()).post('/api/pen/widgets/tap').send(tap({ ownerPnIdentifier: 'pn-someone' }));
    expect(spoof.status).toBe(403);
    const poll = await request(app()).post('/api/pen/widgets/tap').send(tap({ widgetId: 'doc-1:g1' }));
    expect(poll.status).toBe(400);
    const bad = await request(app())
      .post('/api/pen/widgets/tap')
      .send(tap({ row: { ...row('tap-00000002'), headers: ['email'] } }));
    expect(bad.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('respond never accepts a tap, so it cannot use up a vote', async () => {
    const res = await request(app())
      .post('/api/pen/widgets/respond')
      .send({
        userPnIdentifier: 'pn-viewer',
        ownerPnIdentifier: 'pn-owner',
        widgetId: 'doc-1:g1',
        responseId: 'r-1',
        respondKind: 'widget_row',
        row: row('tap-00000003'),
      });
    expect(res.status).toBe(400);
    expect(mockInsertResponse).not.toHaveBeenCalled();
  });
});
