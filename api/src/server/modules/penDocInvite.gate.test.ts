/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false
}));

const validateAccessToken = jest.fn();
const query = jest.fn();
const enqueueSocialJob = jest.fn();

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: (...args: unknown[]) => validateAccessToken(...args)
  }
}));

jest.mock('./integratorStoragePaths', () => {
  const FIRST = new Set(['browser-app', 'messaging-app', 'pen-app', 'prism-app', 'developer-portal']);
  return {
    isFirstPartyClient: (id: string | undefined | null) => !!id && FIRST.has(id)
  };
});

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query })
}));

jest.mock('./socialRail', () => ({
  enqueueSocialJob: (...args: unknown[]) => enqueueSocialJob(...args)
}));

import express from 'express';
import request from 'supertest';
import { setupPenRoutes } from './penRoutes';

describe('pen doc invites', () => {
  beforeEach(() => {
    validateAccessToken.mockReset();
    query.mockReset();
    enqueueSocialJob.mockReset();
    enqueueSocialJob.mockResolvedValue(true);
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    setupPenRoutes(app, {
      extractAccountId: () => undefined,
      getMetadataFolder: async () => null
    });
    return app;
  }

  it('GET invite returns public metadata', async () => {
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM pen_doc_invites')) {
        return {
          rows: [
            {
              invite_id: 'abc123',
              doc_id: 'doc-1',
              group_id: 'grp-1',
              owner_pn: 'pn-owner',
              title: 'My doc',
              role: 'viewer',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              claimed_by: null,
              claimed_at: null
            }
          ]
        };
      }
      return { rows: [] };
    });
    const res = await request(buildApp()).get('/api/pen/invites/abc123');
    expect(res.status).toBe(200);
    expect(res.body.docId).toBe('doc-1');
    expect(res.body.role).toBe('viewer');
    expect(res.body.ownerPn).toBe('pn-owner');
  });

  it('POST claim enqueues owner mailbox job', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-invitee',
      clientId: 'pen-app'
    });
    const future = new Date(Date.now() + 86400000).toISOString();
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FOR UPDATE')) {
        return {
          rows: [
            {
              invite_id: 'abc123',
              doc_id: 'doc-1',
              group_id: 'grp-1',
              owner_pn: 'pn-owner',
              title: 'My doc',
              role: 'viewer',
              created_at: new Date().toISOString(),
              expires_at: future,
              claimed_by: null,
              claimed_at: null
            }
          ]
        };
      }
      return { rows: [] };
    });
    const res = await request(buildApp())
      .post('/api/pen/invites/abc123/claim')
      .set('Authorization', 'Bearer test')
      .send({ inviteeMlKemPublicKey: 'kem-pk-test-value-0123456789' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(enqueueSocialJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'pen.doc_invite_claim', peerPn: 'pn-owner' })
    );
  });
});
