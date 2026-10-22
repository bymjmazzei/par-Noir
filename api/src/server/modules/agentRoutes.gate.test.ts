/**
 * @jest-environment node
 *
 * /api/agent/* fails closed: only pn-agent-mcp bearers whose owner still delegates the
 * scope get through, and responses carry only allowlisted public fields of the owner's
 * published rows.
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

const searchMetadata = jest.fn();
const getFileMetadata = jest.fn();
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({ searchMetadata, getFileMetadata }),
  },
}));

const isActiveAgentConnector = jest.fn();
jest.mock('./clientRegistration', () => ({
  ClientRegistrationService: {
    isActiveAgentConnector: (...args: unknown[]) => isActiveAgentConnector(...args),
  },
}));

import express from 'express';
import request from 'supertest';
import { registerAgentRoutes, resolveAgentContext } from './agentRoutes';

const ROOT = 'pn-root';

function app() {
  const a = express();
  a.use(express.json());
  registerAgentRoutes(a);
  return a;
}

function agentToken(scope = ['openid', 'ai:files.published', 'ai:pen.published']) {
  validateAccessToken.mockReturnValue({ pnIdentifier: 'pn-agent1', clientId: 'pn-agent-mcp', scope });
}

const ROOT_PUBLIC_KEY = 'root-ml-dsa-public-key';
const ATTESTATIONS = [
  { dataPointId: 'over_18', satisfied: true, level: 'verified', expiresAt: null },
  { dataPointId: 'over_21', satisfied: false, level: 'attested', expiresAt: '2026-01-01T00:00:00.000Z' },
];

function delegate(scopes = ['ai:files.published', 'ai:pen.published'], attestations = ATTESTATIONS) {
  resolveAgentDelegation.mockResolvedValue({
    assetId: 'a1',
    rootPnIdentifier: ROOT,
    scopes,
    attestations,
    statement: {
      v: 1,
      rootPublicKey: ROOT_PUBLIC_KEY,
      agentPnIdentifier: 'pn-agent1',
      agentPublicKey: 'agent-pk',
      scopes,
      attestations,
      issuedAt: '2026-10-21T13:00:00.000Z',
      expiresAt: null,
      nonce: 'nonce-abcdefghijklmnop',
    },
  });
}

const SENSITIVE = {
  publicToken: 'tok-secret',
  publicContentRef: { backend: 'google_drive', objectId: 'drive-obj', publicUrl: 'https://x' },
  creator: { '@type': 'Person', '@id': 'did:key:root' },
  author: { did: 'did:key:root' },
  backendFileId: 'drive-obj',
  email: 'owner@example.com',
};

function row(fileId: string, meta: Record<string, unknown>, pn = ROOT) {
  return { fileId, pnIdentifier: pn, submittedAt: '2026-01-01', metadata: { fileId, ...SENSITIVE, ...meta } };
}

beforeEach(() => {
  validateAccessToken.mockReset();
  resolveAgentDelegation.mockReset();
  isActiveAgentConnector.mockReset();
  searchMetadata.mockReset();
  getFileMetadata.mockReset();
});

describe('agent routes gate', () => {
  it('401 without a bearer', async () => {
    validateAccessToken.mockReturnValue(null);
    const res = await request(app()).get('/api/agent/files/search?q=x');
    expect(res.status).toBe(401);
  });

  it('403 for a first-party token', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: ROOT, clientId: 'browser-app', scope: ['openid'] });
    const res = await request(app()).get('/api/agent/files/search').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_client_required');
  });

  it('403 delegation_revoked when the owner revoked the agent', async () => {
    agentToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const res = await request(app()).get('/api/agent/files/search').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('delegation_revoked');
    expect(searchMetadata).not.toHaveBeenCalled();
  });

  it('403 insufficient_scope when the token lacks the scope', async () => {
    agentToken(['openid', 'ai:files.published']);
    delegate();
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });

  it('403 insufficient_scope when the delegation no longer has the scope', async () => {
    agentToken();
    delegate(['ai:pen.published']);
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });

  it('503 fails closed when the delegation lookup errors', async () => {
    agentToken();
    resolveAgentDelegation.mockRejectedValue(new Error('db down'));
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(503);
  });
});

describe('agent-class gate', () => {
  const CONNECTOR = 'pn-connector-0123456789abcdef';
  const connectorPayload = { pnIdentifier: 'pn-agent1', clientId: CONNECTOR, scope: ['ai:files.published'] };

  it('a registered, active connector reaches the delegation check', async () => {
    isActiveAgentConnector.mockResolvedValue(true);
    delegate();
    const result = await resolveAgentContext(connectorPayload, 'ai:files.published');
    expect(result).toMatchObject({ ok: true, agent: { agentPnIdentifier: 'pn-agent1', rootPnIdentifier: ROOT } });
    expect(isActiveAgentConnector).toHaveBeenCalledWith(CONNECTOR);
  });

  it('an unregistered or deactivated connector id is not an agent client', async () => {
    isActiveAgentConnector.mockResolvedValue(false);
    delegate();
    expect(await resolveAgentContext(connectorPayload)).toEqual({ ok: false, status: 403, error: 'agent_client_required' });
    expect(resolveAgentDelegation).not.toHaveBeenCalled();
  });

  it('first-party clients never hit the connector registry', async () => {
    const result = await resolveAgentContext({ pnIdentifier: ROOT, clientId: 'browser-app', scope: ['openid'] });
    expect(result).toEqual({ ok: false, status: 403, error: 'agent_client_required' });
    expect(isActiveAgentConnector).not.toHaveBeenCalled();
  });

  it('a connector whose owner revoked the agent is refused', async () => {
    isActiveAgentConnector.mockResolvedValue(true);
    resolveAgentDelegation.mockResolvedValue(null);
    expect(await resolveAgentContext(connectorPayload)).toEqual({ ok: false, status: 403, error: 'delegation_revoked' });
  });
});

describe('GET /api/agent/proofs/:dataPointId', () => {
  beforeEach(() => {
    agentToken(['openid', 'ai:proofs']);
    delegate(['ai:proofs'], [
      ...ATTESTATIONS,
      { dataPointId: 'email_verification', satisfied: true, level: 'attested', expiresAt: '2099-01-01T00:00:00.000Z', value: 'owner@example.com' } as never,
    ]);
  });

  it('answers with exactly the four attested fields', async () => {
    const res = await request(app()).get('/api/agent/proofs/over_18').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dataPointId: 'over_18', satisfied: true, level: 'verified', expiresAt: null });
    const email = await request(app()).get('/api/agent/proofs/email_verification').set('Authorization', 'Bearer t');
    expect(Object.keys(email.body).sort()).toEqual(['dataPointId', 'expiresAt', 'level', 'satisfied']);
    expect(JSON.stringify(email.body)).not.toContain('owner@example.com');
    expect(searchMetadata).not.toHaveBeenCalled();
    expect(getFileMetadata).not.toHaveBeenCalled();
  });

  it('404 when the owner did not attest that data point', async () => {
    const res = await request(app()).get('/api/agent/proofs/phone_verification').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_attested' });
  });

  it('expired once past expiresAt', async () => {
    const res = await request(app()).get('/api/agent/proofs/over_21').set('Authorization', 'Bearer t');
    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: 'expired' });
  });

  it('400 for a data point that is never attestable', async () => {
    const res = await request(app()).get('/api/agent/proofs/age_attestation').set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
  });

  it('403 without ai:proofs', async () => {
    agentToken(['openid', 'ai:files.published']);
    const res = await request(app()).get('/api/agent/proofs/over_18').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });
});

describe('GET /api/agent/delegation', () => {
  it('returns the signed statement without the owner key or attestations', async () => {
    agentToken();
    delegate(['ai:files.published', 'ai:proofs']);
    const res = await request(app()).get('/api/agent/delegation').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.delegation).toEqual({
      v: 1,
      agentPnIdentifier: 'pn-agent1',
      agentPublicKey: 'agent-pk',
      scopes: ['ai:files.published', 'ai:proofs'],
      issuedAt: '2026-10-21T13:00:00.000Z',
      expiresAt: null,
      nonce: 'nonce-abcdefghijklmnop',
    });
    const raw = JSON.stringify(res.body);
    for (const leak of [ROOT_PUBLIC_KEY, ROOT, 'over_18', 'satisfied', 'signature']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('403 once the owner revokes', async () => {
    agentToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const res = await request(app()).get('/api/agent/delegation').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('delegation_revoked');
  });

  it('403 for a first-party token', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: ROOT, clientId: 'browser-app', scope: ['openid'] });
    const res = await request(app()).get('/api/agent/delegation').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/agent/delegation-status', () => {
  it('returns only {active, scopes}, narrowed to the token', async () => {
    agentToken(['openid', 'ai:files.private', 'ai:files.published']);
    delegate(['ai:files.published', 'ai:files.private', 'ai:pen.private']);
    const res = await request(app()).get('/api/agent/delegation-status').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: true, scopes: ['ai:files.published', 'ai:files.private'] });
    const raw = JSON.stringify(res.body);
    for (const leak of [ROOT, ROOT_PUBLIC_KEY, 'agent-pk', 'nonce', 'over_18']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('reports inactive once the owner revokes', async () => {
    agentToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const res = await request(app()).get('/api/agent/delegation-status').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false, scopes: [] });
  });

  it('401 without a bearer and 403 for a first-party token', async () => {
    validateAccessToken.mockReturnValue(null);
    expect((await request(app()).get('/api/agent/delegation-status')).status).toBe(401);
    validateAccessToken.mockReturnValue({ pnIdentifier: ROOT, clientId: 'browser-app', scope: ['openid'] });
    const res = await request(app()).get('/api/agent/delegation-status').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(resolveAgentDelegation).not.toHaveBeenCalled();
  });

  it('503 fails closed when the lookup errors', async () => {
    agentToken();
    resolveAgentDelegation.mockRejectedValue(new Error('db down'));
    const res = await request(app()).get('/api/agent/delegation-status').set('Authorization', 'Bearer t');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'delegation_unavailable' });
  });
});

describe('agent routes data', () => {
  beforeEach(() => {
    agentToken();
    delegate();
  });

  it('search returns only the owner published rows, allowlisted', async () => {
    searchMetadata.mockResolvedValue({
      files: [
        row('f1', { isPublic: true, name: 'Trip notes', keywords: ['travel'], uploadDate: '2026-02-01' }),
        row('f2', { isPublic: false, publicToken: 'share', name: 'Private' }),
        row('f3', { name: 'Unset visibility' }),
        row('f4', { isPublic: true, name: 'Someone else' }, 'pn-other'),
      ],
      total: 4,
      hasMore: false,
    });
    const res = await request(app()).get('/api/agent/files/search?q=trip').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(searchMetadata).toHaveBeenCalledWith('trip', expect.objectContaining({ authorDid: ROOT }));
    expect(res.body.files.map((f: { fileId: string }) => f.fileId)).toEqual(['f1']);
    expect(Object.keys(res.body.files[0]).sort()).toEqual(
      ['contentClass', 'description', 'fileId', 'fileType', 'publishedAt', 'tags', 'title'].sort()
    );
    const raw = JSON.stringify(res.body);
    for (const leak of ['tok-secret', 'drive-obj', 'did:key', 'owner@example.com', ROOT]) {
      expect(raw).not.toContain(leak);
    }
  });

  it('read file 404s for a row the owner did not publish', async () => {
    getFileMetadata.mockResolvedValue(row('f2', { isPublic: false }));
    const res = await request(app()).get('/api/agent/files/f2').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });

  it('read file 404s for another author', async () => {
    getFileMetadata.mockResolvedValue(row('f4', { isPublic: true }, 'pn-other'));
    const res = await request(app()).get('/api/agent/files/f4').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });

  it('read file returns published text without sensitive fields', async () => {
    getFileMetadata.mockResolvedValue(
      row('f1', { isPublic: true, name: 'Thought', textPost: { content: 'hello world', style: { padding: 2 } } })
    );
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.file).toMatchObject({ fileId: 'f1', title: 'Thought', text: 'hello world', textTruncated: false });
    const raw = JSON.stringify(res.body);
    for (const leak of ['tok-secret', 'drive-obj', 'did:key', 'owner@example.com', 'padding']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('pen returns the published post for the doc', async () => {
    searchMetadata.mockResolvedValue({
      files: [
        row('p0', { isPublic: false, penDocId: 'doc1' }),
        row('p1', { isPublic: true, penDocId: 'doc1', title: 'Essay', textPost: { content: 'body' } }),
      ],
      total: 2,
      hasMore: false,
    });
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ docId: 'doc1', fileId: 'p1', title: 'Essay', text: 'body' });
    expect(JSON.stringify(res.body)).not.toContain('tok-secret');
  });

  it('pen 404s when the doc is not published', async () => {
    searchMetadata.mockResolvedValue({ files: [row('p0', { isPublic: false, penDocId: 'doc1' })], total: 1, hasMore: false });
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });
});
