/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false
}));

const validateAccessToken = jest.fn();
const isVerified = jest.fn();

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

jest.mock('./verificationIntegrationService', () => ({
  VerificationIntegrationService: {
    isVerified: (...args: unknown[]) => isVerified(...args)
  }
}));

import express from 'express';
import request from 'supertest';
import { setupPenRoutes } from './penRoutes';

describe('pen author-verification', () => {
  beforeEach(() => {
    validateAccessToken.mockReset();
    isVerified.mockReset();
    isVerified.mockImplementation(async (pn: string) => pn === 'pn-verified-qa');
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    setupPenRoutes(app);
    return app;
  }

  it('returns verified when the bearer pn has an active verified_identities row', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-verified-qa',
      clientId: 'pen-app'
    });
    const res = await request(buildApp())
      .get('/api/pen/author-verification')
      .set('Authorization', 'Bearer test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true });
    expect(isVerified).toHaveBeenCalledWith('pn-verified-qa');
  });

  it('returns false when the pn is not verified', async () => {
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
