/**
 * Gate: apply-inbound rejects forged promote signatures.
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

jest.mock('./deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { driveUpload: 'drive.upload' },
  requireFirstPartyOAuthClient: (req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
    const { PNOAuthService } = require('./pnOAuthService');
    const { isFirstPartyClient } = require('./integratorStoragePaths');
    const auth = String((req as { headers?: { authorization?: string } }).headers?.authorization || '');
    const token = auth.replace(/^Bearer\s+/i, '');
    const session = PNOAuthService.validateAccessToken(token);
    if (!session || !isFirstPartyClient(session.clientId)) {
      res.status(403).json({ error: 'first_party_required' });
      return false;
    }
    (req as { pnOAuthSession?: unknown }).pnOAuthSession = session;
    return true;
  },
  gateFirstPartyOwnerRoute: async () => true
}));

jest.mock('./ownerDriveToken', () => ({
  resolveOwnerDriveToken: async () => ({
    token: { access_token: 'ga' },
    accountId: 'acc'
  }),
  respondDriveTokenError: () => false
}));

jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: {
    getCredentials: async () => ({
      credentials: { googleDriveAccounts: [{ id: 'acc' }] }
    })
  }
}));

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({
      files: {
        list: async () => ({ data: { files: [] } }),
        create: async () => ({ data: { id: 'fid' } }),
        update: async () => ({ data: { id: 'fid' } }),
        get: async () => ({ data: Buffer.from('') })
      }
    })
  }
}));

import express from 'express';
import request from 'supertest';
import { setupPenRoutes } from './penRoutes';

describe('pen apply-inbound signature gate', () => {
  beforeEach(() => {
    validateAccessToken.mockReset();
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-test',
      clientId: 'pen-app',
      scope: 'openid profile cloud:app'
    });
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    setupPenRoutes(app, {
      extractAccountId: () => 'acc',
      getMetadataFolder: async () => ({ pnFolderId: 'pnf', metadataFolderId: 'meta' })
    });
    return app;
  }

  it('rejects pen.section_promote with forged signature', async () => {
    const res = await request(buildApp())
      .post('/api/pen/apply-inbound')
      .set('Authorization', 'Bearer fake')
      .send({
        userPnIdentifier: 'pn-test',
        docId: 'doc1',
        jobType: 'pen.section_promote',
        sectionSlug: 'body',
        sectionCiphertextB64: Buffer.from('{"slug":"body"}').toString('base64'),
        pastName: 'body-past',
        contentHash: 'abc',
        link: {
          sectionSlug: 'body',
          pastName: 'body-past',
          contentHash: 'abc',
          prevHeadHash: 'prev',
          authorPnHash: 'ah',
          clientPromotedAt: new Date().toISOString(),
          signature: Buffer.from('forged').toString('base64'),
          publicKey: Buffer.from('not-a-real-key').toString('base64')
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('promote_sig_invalid');
  });
});
