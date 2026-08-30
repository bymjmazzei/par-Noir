/**
 * @jest-environment node
 *
 * L5 / third-party OAuth clients must not reach first-party product APIs.
 * Falsification: without requireFirstPartyOAuthClient, a Bearer with client_id
 * "evil-integrator" would pass the auth layer on /api/messages etc.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

const validateAccessToken = jest.fn();

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: (...args: unknown[]) => validateAccessToken(...args),
  },
}));

jest.mock('./integratorStoragePaths', () => {
  const FIRST = new Set(['browser-app', 'messaging-app', 'prism-app', 'developer-portal']);
  return {
    isFirstPartyClient: (id: string | undefined | null) => !!id && FIRST.has(id),
  };
});

import express from 'express';
import type { Request, Response } from 'express';
import { requireFirstPartyOAuthClient } from './deviceCapabilityService';
import {
  L5_PRODUCT_ROUTE_PREFIXES,
  mountL5ProductFirstPartyBoundary,
} from './l5ProductRouteBoundary';

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn((n: number) => {
    res.statusCode = n;
    return res as Response;
  });
  res.json = jest.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

describe('l5ProductRouteBoundary gate', () => {
  beforeEach(() => {
    validateAccessToken.mockReset();
  });

  it('lists the product prefixes that must stay first-party-only', () => {
    expect(L5_PRODUCT_ROUTE_PREFIXES).toEqual(
      expect.arrayContaining([
        '/api/messages',
        '/api/mailbox',
        '/api/connections',
        '/api/groups',
        '/api/engagement',
        '/api/notifications',
        '/api/push',
      ])
    );
  });

  it('rejects missing Bearer with 401', () => {
    const req = { headers: {}, path: '/api/messages/conversations' } as Request;
    const res = mockRes();
    expect(requireFirstPartyOAuthClient(req, res)).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('rejects third-party client_id with 403 first_party_required', () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-testuser',
      clientId: 'evil-integrator',
      scope: ['openid', 'profile', 'cloud:app'],
    });
    const req = {
      headers: { authorization: 'Bearer third-party-token' },
      path: '/api/messages/conversations',
    } as Request;
    const res = mockRes();
    expect(requireFirstPartyOAuthClient(req, res)).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ reason: 'first_party_required' });
  });

  it('allows first-party browser-app Bearer', () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-testuser',
      clientId: 'browser-app',
      scope: ['openid', 'profile', 'cloud:read'],
    });
    const req = {
      headers: { authorization: 'Bearer first-party-token' },
      path: '/api/messages/conversations',
    } as Request;
    const res = mockRes();
    const payload = requireFirstPartyOAuthClient(req, res);
    expect(payload?.clientId).toBe('browser-app');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('mounted middleware returns 403 for third-party on /api/connections', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-testuser',
      clientId: 'evil-integrator',
      scope: ['openid', 'profile'],
    });

    const app = express();
    mountL5ProductFirstPartyBoundary(app);
    app.get('/api/connections', (_req, res) => res.status(200).json({ ok: true }));

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/connections?userPnIdentifier=pn-testuser`, {
        headers: { Authorization: 'Bearer evil-token' },
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason).toBe('first_party_required');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('mounted middleware allows first-party through to handler', async () => {
    validateAccessToken.mockReturnValue({
      pnIdentifier: 'pn-testuser',
      clientId: 'messaging-app',
      scope: ['openid', 'profile', 'cloud:read'],
    });

    const app = express();
    mountL5ProductFirstPartyBoundary(app);
    app.get('/api/messages/conversations', (_req, res) => res.status(200).json({ conversations: [] }));

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/messages/conversations`, {
        headers: { Authorization: 'Bearer fp-token' },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { conversations?: unknown[] };
      expect(body.conversations).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
