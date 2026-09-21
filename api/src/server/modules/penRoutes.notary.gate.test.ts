/**
 * @jest-environment node
 *
 * Pen notary is first-party only and hash-only (no plaintext body).
 * Falsification: L5 Bearer must get 403; missing hash must 400.
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

describe('pen notary first-party gate', () => {
  beforeEach(() => {
    validateAccessToken.mockReset();
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

  it('rejects L5 client on notary timestamp', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-test',
      clientId: 'evil-integrator',
      scope: 'openid profile cloud:app'
    });
    const res = await request(buildApp())
      .post('/api/pen/notary/timestamp')
      .set('Authorization', 'Bearer fake')
      .send({ hash: 'a'.repeat(64) });

    expect(res.status).toBe(403);
    expect(res.body.reason || res.body.error).toMatch(/first_party/i);
  });

  it('stamps hash for pen-app without echoing plaintext', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-test',
      clientId: 'pen-app',
      scope: 'openid profile cloud:read'
    });

    const hash = 'b'.repeat(64);
    const res = await request(buildApp())
      .post('/api/pen/notary/timestamp')
      .set('Authorization', 'Bearer fake')
      .send({ hash, plaintext: 'should-be-ignored' });

    expect(res.status).toBe(200);
    expect(res.body.hash).toBe(hash);
    expect(res.body.notaryTime).toBeTruthy();
    expect(res.body.notarySig).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/should-be-ignored/);
  });

  it('400 when hash missing', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-test',
      clientId: 'pen-app',
      scope: 'openid'
    });

    const res = await request(buildApp())
      .post('/api/pen/notary/timestamp')
      .set('Authorization', 'Bearer t')
      .send({});

    expect(res.status).toBe(400);
  });
});
