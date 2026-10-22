/**
 * @jest-environment node
 *
 * GET /api/owned-assets/agents/:id/connectors: only the first-party owner of the agent sees
 * which apps sign in as it, and the answer is a name, a kind and a last-used time. Never a
 * pN, the agent key, a refresh token, a client id or a DID.
 * Falsification: drop the owner gate, the root filter or the projection and a case fails.
 */

const queries: Array<{ sql: string; params: unknown[] }> = [];

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return respond(sql, params);
    }),
  }),
}));

jest.mock('../middleware/authMiddleware', () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    const pn = req.header('x-test-pn');
    if (!pn) return res.status(401).json({ error: 'unauthorized' });
    req.user = { pnIdentifier: pn, clientId: req.header('x-test-client') || 'pn-dashboard' };
    next();
  },
}));

const gateFirstPartyOwnerRoute = jest.fn(async (req: any, res: any, _cap: string, pn: string) => {
  if (req.user.clientId !== 'pn-dashboard' || pn !== req.user.pnIdentifier) {
    res.status(403).json({ error: 'first_party_required' });
    return null;
  }
  return {};
});
jest.mock('./deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { profileRead: 'profile.read', profileWrite: 'profile.write' },
  gateFirstPartyOwnerRoute: (...args: [any, any, string, string]) => gateFirstPartyOwnerRoute(...args),
  gateOwnerRoute: jest.fn(async () => ({})),
  gateOwnerSelfRoute: jest.fn(async () => ({})),
}));

jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  assertMlDsa65PublicKeyB64: () => true,
  deriveCanonicalPnIdentifier: (pk: string) => `pn-${pk}`,
}));
jest.mock('./auditService', () => ({ appendAuditEvent: jest.fn(async () => undefined) }));
jest.mock('./identitySuccessionService', () => ({ isPnRevokedForNetwork: () => false }));
jest.mock('./ownedAssetStorageService', () => ({ loadOwnedAssetDriveBundle: jest.fn() }));
jest.mock('./ownedAssetsSheetsService', () => ({ OwnedAssetsSheetsService: {} }));

import express from 'express';
import request from 'supertest';
import { registerOwnedAssetRoutes } from './ownedAssetRoutes';

const ROOT = 'pn-rootowner01';
const OTHER_ROOT = 'pn-otherowner2';
const AGENT_PN = 'pn-agentsubpn1';
const AGENT_PK = 'agent-public-key-b64';
const ASSET = '11111111-2222-4333-8444-555555555555';
const CONNECTOR = 'pn-connector-0123456789abcdef';
const REFRESH_HASH = 'refresh-hash-should-never-leave';

function respond(sql: string, params: unknown[]): { rows: Record<string, unknown>[] } {
  if (sql.includes('SELECT subject_public_key FROM pn_owned_assets')) {
    return params[0] === ASSET && params[1] === ROOT
      ? { rows: [{ subject_public_key: AGENT_PK, subject_pn_identifier: AGENT_PN }] }
      : { rows: [] };
  }
  if (sql.includes('FROM oauth_refresh_tokens')) {
    return {
      rows: [
        {
          client_id: CONNECTOR,
          client_name: 'Claude',
          last_used_at: '2026-10-22T14:00:00.000Z',
          refresh_token: REFRESH_HASH,
          did: `did:pn:${AGENT_PN}`,
          public_key: AGENT_PK,
          pn_identifier: AGENT_PN,
        },
        {
          client_id: 'pn-agent-mcp',
          client_name: 'par Noir MCP (AI agents)',
          last_used_at: '2026-10-21T09:30:00.000Z',
        },
      ],
    };
  }
  return { rows: [] };
}

function app() {
  const a = express();
  a.use(express.json());
  registerOwnedAssetRoutes(a);
  return a;
}

function get(id: string, pn: string | null = ROOT, client?: string) {
  const r = request(app()).get(`/api/owned-assets/agents/${id}/connectors`);
  if (pn) r.set('x-test-pn', pn);
  if (client) r.set('x-test-client', client);
  return r;
}

beforeEach(() => {
  queries.length = 0;
  gateFirstPartyOwnerRoute.mockClear();
});

describe('GET /api/owned-assets/agents/:id/connectors', () => {
  it('lists the apps signed in as the agent with name, kind and last used only', async () => {
    const res = await get(ASSET);
    expect(res.status).toBe(200);
    expect(res.body.connectors).toEqual([
      { kind: 'connector', name: 'Claude', lastUsedAt: '2026-10-22T14:00:00.000Z' },
      { kind: 'local', name: 'pn-mcp on your Mac', lastUsedAt: '2026-10-21T09:30:00.000Z' },
    ]);
    const body = JSON.stringify(res.body);
    for (const secret of [ROOT, AGENT_PN, AGENT_PK, REFRESH_HASH, CONNECTOR, 'did:pn', 'pn-agent-mcp']) {
      expect(body).not.toContain(secret);
    }
    for (const key of ['refresh_token', 'refreshToken', 'token', 'clientId', 'client_id', 'pnIdentifier', 'publicKey', 'did']) {
      expect(body).not.toContain(`"${key}"`);
    }
  });

  it('checks the first-party owner gate with read capability for the caller pN', async () => {
    await get(ASSET);
    expect(gateFirstPartyOwnerRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'profile.read',
      ROOT
    );
  });

  it('scopes the token lookup to the agent key and agent-class clients', async () => {
    await get(ASSET);
    const tokens = queries.find((q) => q.sql.includes('FROM oauth_refresh_tokens'));
    expect(tokens?.params).toEqual([AGENT_PK, 'pn-agent-mcp', 'pn-connector-%']);
    expect(tokens?.sql).toContain('t.revoked_at IS NULL AND t.used_at IS NULL AND t.expires_at > NOW()');
  });

  it('answers 404 for an agent that belongs to another root, without reading tokens', async () => {
    const res = await get(ASSET, OTHER_ROOT);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(queries.some((q) => q.sql.includes('FROM oauth_refresh_tokens'))).toBe(false);
  });

  it('answers 404 for a malformed id without touching the database', async () => {
    const res = await get('not-a-uuid');
    expect(res.status).toBe(404);
    expect(queries).toHaveLength(0);
  });

  it('refuses agent and third-party bearers', async () => {
    const res = await get(ASSET, ROOT, CONNECTOR);
    expect(res.status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('refuses unauthenticated callers', async () => {
    const res = await get(ASSET, null);
    expect(res.status).toBe(401);
    expect(queries).toHaveLength(0);
  });
});
