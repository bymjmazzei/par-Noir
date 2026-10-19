/**
 * @jest-environment node
 */
const mockQuery = jest.fn();
jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

const mockIncrement = jest.fn(async () => undefined);
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: { getInstance: () => ({ incrementPageView: mockIncrement }) },
}));

import express from 'express';
import request from 'supertest';
import { hashPnIdentifier } from '@par-noir/pen-protocol';
import { registerFileViewRoutes } from './fileViewRoutes';

function app() {
  const server = express();
  server.use(express.json());
  registerFileViewRoutes(server);
  return server;
}

describe('POST /api/file-views/page', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIncrement.mockClear();
  });

  it('counts a page once per viewer per day and stores only a hashed viewer', async () => {
    const seen = new Set<string>();
    mockQuery.mockImplementation(async (_sql: string, params: string[]) => {
      const key = params.join('|');
      if (seen.has(key)) return { rows: [] };
      seen.add(key);
      return { rows: [{ file_id: params[0] }] };
    });
    const body = { fileId: 'post-1', pageSlug: 'menu', userPnIdentifier: 'pn-viewer' };
    const first = await request(app()).post('/api/file-views/page').send(body);
    const second = await request(app()).post('/api/file-views/page').send(body);
    expect(first.body.counted).toBe(true);
    expect(second.body.counted).toBe(false);
    expect(mockIncrement).toHaveBeenCalledTimes(1);
    expect(mockIncrement).toHaveBeenCalledWith('post-1', 'menu');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['post-1', 'menu', hashPnIdentifier('pn-viewer')]);
    expect(params).not.toContain('pn-viewer');

    await request(app()).post('/api/file-views/page').send({ ...body, pageSlug: 'offer' });
    expect(mockIncrement).toHaveBeenLastCalledWith('post-1', 'offer');
  });

  it('only counts unlocked viewers and plain slugs', async () => {
    const locked = await request(app()).post('/api/file-views/page').send({ fileId: 'post-1', pageSlug: 'menu' });
    expect(locked.status).toBe(400);
    const odd = await request(app())
      .post('/api/file-views/page')
      .send({ fileId: 'post-1', pageSlug: '../x', userPnIdentifier: 'pn-viewer' });
    expect(odd.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
