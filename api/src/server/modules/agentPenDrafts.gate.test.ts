/**
 * @jest-environment node
 *
 * AI agent Pen drafts: the agent learns the owner's ML-KEM key and nothing else, the API
 * accepts only a sealed `{draftId, envelope}`, size and daily limits hold, a retry does not
 * spend quota, and the durable mailbox row is ciphertext only with a 7-day TTL.
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

const resolveAgentDelegation = jest.fn();
jest.mock('./ownedAssetService', () => ({
  OwnedAssetService: {
    resolveAgentDelegation: (...args: unknown[]) => resolveAgentDelegation(...args),
  },
}));

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: { getInstance: () => ({}) },
}));

interface MailboxRow {
  id: string;
  route_key: string;
  job_type: string;
  payload: string;
  idempotency_key: string;
  created_at: Date;
  expires_at: Date;
  acked_at: null;
}

const db = {
  profiles: new Map<string, string>(),
  routes: new Map<string, string>(),
  quota: new Map<string, number>(),
  mailbox: [] as MailboxRow[],
};

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes('FROM user_profiles')) {
    const key = db.profiles.get(String(params[0]));
    return { rows: key ? [{ ml_kem_public_key: key }] : [], rowCount: key ? 1 : 0 };
  }
  if (sql.includes('SELECT route_key FROM mailbox_route_binding')) {
    const key = db.routes.get(String(params[0]));
    return { rows: key ? [{ route_key: key }] : [], rowCount: key ? 1 : 0 };
  }
  if (sql.includes('INSERT INTO agent_pen_draft_quota')) {
    const k = String(params[0]);
    const n = db.quota.get(k) ?? 0;
    if (n >= Number(params[1])) return { rows: [], rowCount: 0 };
    db.quota.set(k, n + 1);
    return { rows: [{ count: n + 1 }], rowCount: 1 };
  }
  if (sql.includes('INSERT INTO social_mailbox')) {
    const row: MailboxRow = {
      id: String(params[0]),
      route_key: String(params[1]),
      job_type: String(params[2]),
      payload: String(params[3]),
      idempotency_key: String(params[4]),
      created_at: new Date(),
      expires_at: new Date(Date.now() + Number(params[5]) * 3_600_000),
      acked_at: null,
    };
    db.mailbox.push(row);
    return { rows: [row], rowCount: 1 };
  }
  if (sql.includes('FROM social_mailbox')) {
    const rows = db.mailbox.filter(
      (r) => r.route_key === params[0] && r.job_type === params[1] && r.idempotency_key === params[2]
    );
    return { rows, rowCount: rows.length };
  }
  throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
});
jest.mock('../utils/database', () => ({ getDatabasePool: () => ({ query }) }));

import express from 'express';
import request from 'supertest';
import { registerAgentRoutes } from './agentRoutes';
import { mailboxOwnerHash } from './socialMailboxService';

const ROOT = 'pn-root-owner';
const AGENT = 'pn-agent1';
const OWNER_KEM = 'owner-ml-kem-public-key';
const ROUTE = 'a'.repeat(64);
const ENVELOPE = { kemCiphertext: 'kem-ct-base64', ciphertext: 'aes-gcm-ct-base64' };

function app() {
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  registerAgentRoutes(a);
  return a;
}

function agentToken(scope = ['openid', 'ai:pen.drafts'], pn = AGENT) {
  validateAccessToken.mockReturnValue({ pnIdentifier: pn, clientId: 'pn-agent-mcp', scope });
}

function delegate(scopes = ['ai:pen.drafts']) {
  resolveAgentDelegation.mockResolvedValue({
    assetId: 'a1',
    rootPnIdentifier: ROOT,
    scopes,
    attestations: [],
    statement: {
      v: 1,
      rootPublicKey: 'root-pk',
      agentPnIdentifier: AGENT,
      agentPublicKey: 'agent-pk',
      scopes,
      attestations: [],
      issuedAt: '2026-10-21T13:00:00.000Z',
      expiresAt: null,
      nonce: 'nonce-abcdefghijklmnop',
    },
  });
}

function post(body: unknown) {
  return request(app()).post('/api/agent/pen/drafts').set('Authorization', 'Bearer t').send(body as object);
}

beforeEach(() => {
  validateAccessToken.mockReset();
  resolveAgentDelegation.mockReset();
  query.mockClear();
  db.profiles = new Map([[ROOT, OWNER_KEM]]);
  db.routes = new Map([[mailboxOwnerHash(ROOT), ROUTE]]);
  db.quota = new Map();
  db.mailbox = [];
  agentToken();
  delegate();
});

describe('GET /api/agent/owner-key', () => {
  it('returns only the owner ML-KEM public key, never the pN', async () => {
    const res = await request(app()).get('/api/agent/owner-key').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mlKemPublicKey: OWNER_KEM });
    expect(JSON.stringify(res.body)).not.toContain(ROOT);
  });

  it('404 when the owner has not published a key', async () => {
    db.profiles.clear();
    const res = await request(app()).get('/api/agent/owner-key').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'owner_key_missing' });
  });

  it('403 without ai:pen.drafts', async () => {
    agentToken(['openid', 'ai:files.published']);
    const res = await request(app()).get('/api/agent/owner-key').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });
});

describe('POST /api/agent/pen/drafts', () => {
  it('stores only the sealed envelope, with a 7-day TTL, and answers awaiting_owner', async () => {
    const res = await post({ draftId: 'draft_0001', envelope: ENVELOPE });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ draftId: 'draft_0001', status: 'awaiting_owner' });

    expect(db.mailbox).toHaveLength(1);
    const row = db.mailbox[0];
    expect(row.route_key).toBe(ROUTE);
    expect(row.job_type).toBe('pen_agent_draft');
    expect(JSON.parse(row.payload)).toEqual({ envelope: ENVELOPE, envelopeContext: 'pen-agent-draft:draft_0001' });
    const ttlHours = (row.expires_at.getTime() - row.created_at.getTime()) / 3_600_000;
    expect(Math.round(ttlHours)).toBe(168);
    expect(JSON.stringify(row)).not.toContain(ROOT);
    expect(JSON.stringify(row)).not.toContain(AGENT);
  });

  it('refuses anything that is not exactly a sealed envelope', async () => {
    const bodies = [
      { draftId: 'draft_0001', build: { templateId: 'note.hot_take.v1', title: 'Plain' } },
      { draftId: 'draft_0001', envelope: ENVELOPE, build: { title: 'Plain' } },
      { draftId: 'draft_0001', envelope: { ...ENVELOPE, title: 'Plain' } },
      { draftId: 'bad id', envelope: ENVELOPE },
      { envelope: ENVELOPE },
    ];
    for (const body of bodies) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'sealed_draft_required' });
    }
    expect(db.mailbox).toHaveLength(0);
    expect(db.quota.size).toBe(0);
  });

  it('413 above 256 KB', async () => {
    const res = await post({
      draftId: 'draft_0001',
      envelope: { kemCiphertext: 'k', ciphertext: 'x'.repeat(256 * 1024) },
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'draft_too_large' });
    expect(db.mailbox).toHaveLength(0);
  });

  it('caps each agent at 20 drafts a day', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await post({ draftId: `draft_${String(i).padStart(4, '0')}`, envelope: ENVELOPE });
      expect(res.status).toBe(201);
    }
    const over = await post({ draftId: 'draft_0020', envelope: ENVELOPE });
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'draft_rate_limited' });
    expect(db.mailbox).toHaveLength(20);

    agentToken(['openid', 'ai:pen.drafts'], 'pn-agent2');
    const other = await post({ draftId: 'draft_0020', envelope: ENVELOPE });
    expect(other.status).toBe(201);
  });

  it('a retry with the same draftId is idempotent and spends no quota', async () => {
    expect((await post({ draftId: 'draft_0001', envelope: ENVELOPE })).status).toBe(201);
    const again = await post({ draftId: 'draft_0001', envelope: ENVELOPE });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ draftId: 'draft_0001', status: 'awaiting_owner' });
    expect(db.mailbox).toHaveLength(1);
    expect([...db.quota.values()]).toEqual([1]);
  });

  it('409 when the owner has no inbox route yet', async () => {
    db.routes.clear();
    const res = await post({ draftId: 'draft_0001', envelope: ENVELOPE });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'owner_inbox_unavailable' });
  });

  it('403 without ai:pen.drafts, and once the owner revokes', async () => {
    agentToken(['openid', 'ai:files.published']);
    expect((await post({ draftId: 'draft_0001', envelope: ENVELOPE })).status).toBe(403);

    agentToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const revoked = await post({ draftId: 'draft_0001', envelope: ENVELOPE });
    expect(revoked.status).toBe(403);
    expect(revoked.body.error).toBe('delegation_revoked');
    expect(db.mailbox).toHaveLength(0);
  });
});
