/**
 * @jest-environment node
 *
 * Remote /mcp: only bearers minted for /mcp get in, a 401 points connectors at the protected
 * resource metadata, private tools never exist, and drafts reach storage as ciphertext only.
 * Falsification: validate with the default audience, register in local mode, or forward the
 * plaintext build, and the matching case fails.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v.length})`,
  isDevVerbose: () => false,
}));

const validateAccessToken = jest.fn();
jest.mock('./pnOAuthService', () => ({
  PNOAuthService: { validateAccessToken: (...args: unknown[]) => validateAccessToken(...args) },
}));

const resolveAgentDelegation = jest.fn();
jest.mock('./ownedAssetService', () => ({
  OwnedAssetService: { resolveAgentDelegation: (...args: unknown[]) => resolveAgentDelegation(...args) },
}));

const searchMetadata = jest.fn();
const getFileMetadata = jest.fn();
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: { getInstance: () => ({ searchMetadata, getFileMetadata }) },
}));

const isActiveAgentConnector = jest.fn();
jest.mock('./clientRegistration', () => ({
  ClientRegistrationService: { isActiveAgentConnector: (...args: unknown[]) => isActiveAgentConnector(...args) },
}));

const getOwnerMlKemPublicKey = jest.fn();
const submitAgentPenDraft = jest.fn();
jest.mock('./agentPenDraftService', () => ({
  getOwnerMlKemPublicKey: (...args: unknown[]) => getOwnerMlKemPublicKey(...args),
  submitAgentPenDraft: (...args: unknown[]) => submitAgentPenDraft(...args),
}));

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import express from 'express';
import request from 'supertest';
import { registerMcpRemoteRoutes } from './mcpRemoteRoutes';

const MCP = 'https://api.parnoir.com/mcp';
const RESOURCE_METADATA = 'https://api.parnoir.com/.well-known/oauth-protected-resource';
const CONNECTOR = 'pn-connector-0123456789abcdef';
const ROOT = 'pn-root';
const ALL_REMOTE = ['ai:files.published', 'ai:pen.published', 'ai:proofs', 'ai:pen.drafts'];
const PRIVATE = ['ai:files.private', 'ai:pen.private'];
const owner = ml_kem768.keygen();

function app() {
  const a = express();
  a.use(express.json());
  registerMcpRemoteRoutes(a);
  return a;
}

function connectorToken(scope = ALL_REMOTE) {
  validateAccessToken.mockImplementation((_token: string, audience?: string) =>
    audience === MCP ? { pnIdentifier: 'pn-agent1', clientId: CONNECTOR, scope } : null
  );
}

function delegate(scopes = ALL_REMOTE) {
  resolveAgentDelegation.mockResolvedValue({
    assetId: 'a1',
    rootPnIdentifier: ROOT,
    scopes,
    attestations: [],
    statement: {},
  });
}

function rpc(method: string, params: Record<string, unknown> = {}) {
  return request(app())
    .post('/mcp')
    .set('Authorization', 'Bearer t')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send({ jsonrpc: '2.0', id: 1, method, params });
}

beforeAll(() => {
  delete process.env.API_PUBLIC_URL;
  delete process.env.PUBLIC_API_URL;
});

beforeEach(() => {
  validateAccessToken.mockReset();
  resolveAgentDelegation.mockReset();
  isActiveAgentConnector.mockReset();
  isActiveAgentConnector.mockResolvedValue(true);
  getOwnerMlKemPublicKey.mockReset();
  submitAgentPenDraft.mockReset();
  searchMetadata.mockReset();
  getFileMetadata.mockReset();
});

describe('/mcp auth', () => {
  it('401 without a bearer points at the protected resource metadata', async () => {
    const res = await request(app()).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}"`);
  });

  it('a token for any other audience is invalid_token, and only the /mcp audience is checked', async () => {
    validateAccessToken.mockImplementation((_t: string, audience?: string) =>
      audience === undefined || audience === 'par-noir-clients'
        ? { pnIdentifier: 'pn-agent1', clientId: 'pn-agent-mcp', scope: ALL_REMOTE }
        : null
    );
    const res = await rpc('tools/list');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", error="invalid_token"`);
    expect(validateAccessToken).toHaveBeenCalledWith('t', MCP);
  });

  it('a revoked delegation sends the connector back through sign-in', async () => {
    connectorToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const res = await rpc('tools/list');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
  });

  it('a deactivated connector is refused', async () => {
    connectorToken();
    delegate();
    isActiveAgentConnector.mockResolvedValue(false);
    const res = await rpc('tools/list');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_client_required');
  });

  it('refuses browser origins other than known connectors', async () => {
    connectorToken();
    delegate();
    const res = await rpc('tools/list').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(resolveAgentDelegation).not.toHaveBeenCalled();
  });

  it('GET is 401 before auth and 405 after (no server stream, stateless)', async () => {
    expect((await request(app()).get('/mcp')).status).toBe(401);
    connectorToken();
    delegate();
    const res = await request(app()).get('/mcp').set('Authorization', 'Bearer t');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });
});

describe('/mcp tools', () => {
  it('lists public tools and the search/fetch aliases, never a private tool', async () => {
    connectorToken([...ALL_REMOTE, ...PRIVATE]);
    delegate([...ALL_REMOTE, ...PRIVATE]);
    const res = await rpc('tools/list');
    expect(res.status).toBe(200);
    const names = (res.body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual([
      'fetch',
      'propose_pen_draft',
      'prove_data_point',
      'read_file',
      'read_pen_document',
      'search',
      'search_my_files',
    ]);
  });

  it('lists only what both the token and the live delegation grant', async () => {
    connectorToken(['ai:files.published', 'ai:proofs']);
    delegate(['ai:proofs', 'ai:pen.published']);
    const res = await rpc('tools/list');
    const names = (res.body.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(['prove_data_point']);
  });

  it('search reads only the owner root, projected to id, title and public URL', async () => {
    connectorToken();
    delegate();
    searchMetadata.mockResolvedValue({
      files: [
        {
          fileId: 'f1',
          pnIdentifier: ROOT,
          metadata: { fileId: 'f1', name: 'Spring notes', isPublic: true, email: 'owner@example.com' },
        },
        { fileId: 'f2', pnIdentifier: 'pn-other', metadata: { fileId: 'f2', name: 'Not mine', isPublic: true } },
      ],
    });
    const res = await rpc('tools/call', { name: 'search', arguments: { query: 'spring' } });
    expect(res.body.result.structuredContent).toEqual({
      results: [{ id: 'f1', title: 'Spring notes', url: 'https://parnoir.com/resource/f1' }],
    });
    expect(searchMetadata).toHaveBeenCalledWith('spring', expect.objectContaining({ authorDid: ROOT }));
    expect(JSON.stringify(res.body)).not.toContain('owner@example.com');
  });

  it('remote drafts are sealed by the server and stored as ciphertext only', async () => {
    connectorToken();
    delegate();
    getOwnerMlKemPublicKey.mockResolvedValue(Buffer.from(owner.publicKey).toString('base64'));
    submitAgentPenDraft.mockResolvedValue({ ok: true, created: true });
    const res = await rpc('tools/call', {
      name: 'propose_pen_draft',
      arguments: {
        draftId: 'draft_0001',
        build: {
          templateId: 'note.hot_take.v1',
          title: 'Plaintext title marker',
          sections: [{ slug: 'body', plainText: 'Plaintext body marker' }],
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.structuredContent).toEqual({ draftId: 'draft_0001', status: 'awaiting_owner' });
    expect(getOwnerMlKemPublicKey).toHaveBeenCalledWith(ROOT);
    expect(submitAgentPenDraft).toHaveBeenCalledTimes(1);
    const { submission, rootPnIdentifier, agentPnIdentifier } = submitAgentPenDraft.mock.calls[0][0];
    expect(rootPnIdentifier).toBe(ROOT);
    expect(agentPnIdentifier).toBe('pn-agent1');
    expect(Object.keys(submission).sort()).toEqual(['draftId', 'envelope']);
    expect(JSON.stringify(submission)).not.toContain('Plaintext');
  });

  it('a private tool call is unknown on the remote endpoint', async () => {
    connectorToken([...ALL_REMOTE, ...PRIVATE]);
    delegate([...ALL_REMOTE, ...PRIVATE]);
    const res = await rpc('tools/call', { name: 'read_private_file', arguments: { fileId: 'f1' } });
    const failed = res.body.error || res.body.result?.isError;
    expect(failed).toBeTruthy();
    expect(getFileMetadata).not.toHaveBeenCalled();
  });
});
