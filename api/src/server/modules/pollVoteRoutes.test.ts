/**
 * @jest-environment node
 *
 * A write-in vote carries the typed answer to the owner inside the sealed job.
 * The public vote cache only ever stores the option id.
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

const mockInsertVote = jest.fn(async (_vote: unknown) => ({ inserted: true }));
jest.mock('./pollVoteCache', () => {
  const actual = jest.requireActual('./pollVoteCache');
  return {
    ...actual,
    readPollStructureCache: async () => ({
      docId: 'doc-1',
      question: 'What next?',
      options: [
        { id: 'a', label: 'A' },
        { id: 'other', label: 'Other', writeIn: true },
      ],
      closesAt: null,
    }),
    insertPollVoteCache: (vote: unknown) => mockInsertVote(vote),
    pollCounts: async () => ({ total: 0, byOption: {} }),
  };
});

import express from 'express';
import request from 'supertest';
import { setupPollVoteRoutes } from './pollVoteRoutes';

function app() {
  const server = express();
  server.use(express.json());
  setupPollVoteRoutes(server);
  return server;
}

const base = {
  userPnIdentifier: 'pn-voter',
  ownerPnIdentifier: 'pn-owner',
  pollId: 'sheet-1',
  docId: 'doc-1',
  voteId: 'vote-1',
};

describe('POST /api/pen/polls/vote write-in', () => {
  it('seals the normalized answer for the owner and keeps it out of the cache', async () => {
    const res = await request(app())
      .post('/api/pen/polls/vote')
      .send({ ...base, optionId: 'other', writeIn: '  Dark   mode ' });
    expect(res.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'pen.poll_vote',
        peerPn: 'pn-owner',
        sealed: expect.objectContaining({ optionId: 'other', writeIn: 'Dark mode' }),
      })
    );
    expect(mockInsertVote).toHaveBeenCalledWith({ voteId: 'vote-1', pollId: 'sheet-1', optionId: 'other' });
  });

  it('rejects an empty write-in, text on a plain option, and non-string text', async () => {
    const empty = await request(app())
      .post('/api/pen/polls/vote')
      .send({ ...base, optionId: 'other', writeIn: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('write_in_required');

    const plain = await request(app())
      .post('/api/pen/polls/vote')
      .send({ ...base, optionId: 'a', writeIn: 'hello' });
    expect(plain.status).toBe(409);
    expect(plain.body.error).toBe('write_in_not_allowed');

    const bad = await request(app())
      .post('/api/pen/polls/vote')
      .send({ ...base, optionId: 'other', writeIn: { text: 'x' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('write_in_invalid');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
