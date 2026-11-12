/**
 * @jest-environment node
 *
 * RFC 3161 proxy: first-party only, imprint-only, and the token must stamp the same imprint
 * and nonce the API sent.
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
import { buildTimeStampRequest } from '@par-noir/pen-protocol';
import { setupTimestampRoutes } from './timestampRoutes';
import { stampImprint, TimestampError } from './timestampService';

function app() {
  const a = express();
  a.use(express.json());
  setupTimestampRoutes(a);
  return a;
}

describe('/api/timestamp gate', () => {
  beforeEach(() => validateAccessToken.mockReset());

  it('rejects a third-party client', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: 'pn-test', clientId: 'evil-integrator', scope: 'openid' });
    const res = await request(app())
      .post('/api/timestamp')
      .set('Authorization', 'Bearer fake')
      .send({ imprint: 'a'.repeat(64) });
    expect(res.status).toBe(403);
  });

  it('400 without a SHA-256 imprint', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: 'pn-test', clientId: 'pen-app', scope: 'openid' });
    const res = await request(app())
      .post('/api/timestamp')
      .set('Authorization', 'Bearer fake')
      .send({ imprint: 'abc', plaintext: 'never' });
    expect(res.status).toBe(400);
  });
});

describe('stampImprint', () => {
  it('sends a TimeStampReq for the imprint and refuses a reply that stamps something else', async () => {
    const imprint = new Uint8Array(32).fill(9);
    let sent: Uint8Array | null = null;
    const fakeFetch = (async (_url: string, init: { body: Buffer }) => {
      sent = new Uint8Array(init.body);
      return new Response(new Uint8Array(Buffer.from('30053003020102', 'hex')), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(stampImprint(imprint, fakeFetch)).rejects.toMatchObject({ code: 'tsa_rejected' });
    const hex = Buffer.from(sent!).toString('hex');
    expect(hex).toContain('0420' + '09'.repeat(32));
    expect(hex.endsWith('0101ff')).toBe(true);
  });

  it('builds the same request shape the package does', () => {
    const req = Buffer.from(buildTimeStampRequest(new Uint8Array(32), new Uint8Array([1]))).toString('hex');
    expect(req).toContain('300d06096086480165030402010500');
    expect(TimestampError).toBeDefined();
  });
});
