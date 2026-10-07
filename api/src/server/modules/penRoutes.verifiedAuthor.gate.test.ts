/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false
}));

const validateAccessToken = jest.fn();

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

import express from 'express';
import request from 'supertest';
import { setupPenRoutes } from './penRoutes';

describe('pen author-verification', () => {
  const prev = process.env.PEN_VERIFIED_AUTHOR_PN_IDS;

  beforeEach(() => {
    validateAccessToken.mockReset();
    process.env.PEN_VERIFIED_AUTHOR_PN_IDS = 'pn-verified-qa';
  });

  afterAll(() => {
    process.env.PEN_VERIFIED_AUTHOR_PN_IDS = prev;
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

  it('returns verified for allowlisted bearer pn', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-verified-qa',
      clientId: 'pen-app'
    });
    const res = await request(buildApp())
      .get('/api/pen/author-verification')
      .set('Authorization', 'Bearer test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it('returns false when not on allowlist', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-other',
      clientId: 'pen-app'
    });
    const res = await request(buildApp())
      .get('/api/pen/author-verification')
      .set('Authorization', 'Bearer test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });
});
