/**
 * @jest-environment node
 *
 * Hosted AI connectors: discovery advertises only S256 and remote ai: scopes, registration
 * refuses anything but public https/loopback clients asking for remote ai: scopes, authorize
 * forwards PKCE/state/resource to Unlock, and connector tokens are bound to /mcp so no other
 * route accepts them. Falsification: drop any check and the matching case lets a bad request through.
 */
import { createHash } from 'crypto';

type Row = Record<string, unknown>;
let responder: (sql: string, params: unknown[]) => { rows: Row[] } = () => ({ rows: [] });
const queries: Array<{ sql: string; params: unknown[] }> = [];

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return responder(sql, params);
    }),
  }),
}));

jest.mock('../utils/cache', () => ({ getCacheClient: () => null }));

jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
}));

const getClient = jest.fn();
const registerClient = jest.fn();
jest.mock('./clientRegistration', () => ({
  ClientRegistrationService: {
    getClient: (...a: unknown[]) => getClient(...a),
    registerClient: (...a: unknown[]) => registerClient(...a),
    isActiveAgentConnector: async (id: string) => {
      const c = await getClient(id);
      return Boolean(c?.isActive && c?.clientType === 'agent_connector');
    },
    ensureDefaultClientsSeeded: async () => undefined,
    validateClient: async () => true,
    validateScopes: async () => true,
  },
}));

import express, { type RequestHandler } from 'express';
import request from 'supertest';
import {
  isAllowedConnectorRedirectUri,
  parseConnectorRegistration,
  registerAgentConnectorRoutes,
} from './agentConnectorOAuth';
import { setupPnOAuthRoutes } from './pnOAuthRoutes';
import { PNOAuthService, clientRequiresPkce } from './pnOAuthService';

const MCP = 'https://api.parnoir.com/mcp';
const CONNECTOR = 'pn-connector-0123456789abcdef';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const STATE = 'state-abcdefgh';

function connectorClient(over: Row = {}) {
  return {
    clientId: CONNECTOR,
    name: 'Claude',
    redirectUris: [REDIRECT],
    scopes: ['ai:files.published', 'ai:pen.published', 'ai:proofs', 'ai:pen.drafts'],
    isActive: true,
    clientType: 'agent_connector',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function app() {
  const a = express();
  a.use(express.json());
  a.use(express.urlencoded({ extended: true }));
  const pass: RequestHandler = (_req, _res, next) => next();
  registerAgentConnectorRoutes(a, { registerLimiter: pass });
  setupPnOAuthRoutes(a, { extractAccountId: () => undefined, oauthTokenLimiter: pass, authLimiter: pass });
  return a;
}

beforeAll(() => {
  delete process.env.API_PUBLIC_URL;
  delete process.env.PUBLIC_API_URL;
  delete process.env.PN_UNLOCK_ORIGIN;
});

beforeEach(() => {
  responder = () => ({ rows: [] });
  queries.length = 0;
  getClient.mockReset();
  registerClient.mockReset();
  registerClient.mockImplementation(async (c: Row) => c);
});

describe('discovery', () => {
  it('protected resource metadata names /mcp and only remote ai: scopes', async () => {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const res = await request(app()).get(path);
      expect(res.status).toBe(200);
      expect(res.body.resource).toBe(MCP);
      expect(res.body.authorization_servers).toEqual(['https://api.parnoir.com']);
      expect(res.body.scopes_supported).toEqual(['ai:files.published', 'ai:pen.published', 'ai:proofs', 'ai:pen.drafts']);
    }
  });

  it('authorization server metadata: S256 only, public clients, no local-only scopes', async () => {
    const res = await request(app()).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      issuer: 'https://api.parnoir.com',
      authorization_endpoint: 'https://api.parnoir.com/oauth/authorize',
      token_endpoint: 'https://api.parnoir.com/oauth/token',
      registration_endpoint: 'https://api.parnoir.com/oauth/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
    expect(res.body.scopes_supported).not.toContain('ai:files.private');
    expect(res.body.scopes_supported).not.toContain('ai:pen.private');
    expect(res.body.scopes_supported.every((s: string) => s.startsWith('ai:'))).toBe(true);
  });
});

describe('dynamic client registration', () => {
  it('redirects must be https or loopback http, without wildcards, fragments or userinfo', () => {
    expect(isAllowedConnectorRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedConnectorRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
    expect(isAllowedConnectorRedirectUri('http://localhost:6274/cb')).toBe(true);
    expect(isAllowedConnectorRedirectUri('http://evil.example/cb')).toBe(false);
    expect(isAllowedConnectorRedirectUri('https://*.example.com/cb')).toBe(false);
    expect(isAllowedConnectorRedirectUri('https://claude.ai/cb#x')).toBe(false);
    expect(isAllowedConnectorRedirectUri('https://user:pw@claude.ai/cb')).toBe(false);
    expect(isAllowedConnectorRedirectUri('javascript:alert(1)')).toBe(false);
  });

  it('refuses non-ai: and local-only scopes', () => {
    for (const scope of ['openid ai:files.published', 'ai:files.private', 'profile']) {
      const r = parseConnectorRegistration({ redirect_uris: [REDIRECT], scope });
      expect(r).toMatchObject({ ok: false, error: 'invalid_client_metadata' });
    }
  });

  it('refuses confidential clients and grants other than code/refresh', () => {
    expect(
      parseConnectorRegistration({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' })
    ).toMatchObject({ ok: false });
    expect(parseConnectorRegistration({ redirect_uris: [REDIRECT], grant_types: ['client_credentials'] })).toMatchObject({
      ok: false,
    });
  });

  it('400 invalid_redirect_uri for an http redirect and stores nothing', async () => {
    const res = await request(app())
      .post('/oauth/register')
      .send({ redirect_uris: ['http://claude.example/cb'], client_name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('registers a public agent_connector client with remote ai: scopes by default', async () => {
    const res = await request(app())
      .post('/oauth/register')
      .send({ redirect_uris: [REDIRECT], client_name: 'Claude', token_endpoint_auth_method: 'none' });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toMatch(/^pn-connector-[0-9a-f]{32}$/);
    expect(res.body.client_secret).toBeUndefined();
    expect(res.body.token_endpoint_auth_method).toBe('none');
    expect(res.body.scope).toBe('ai:files.published ai:pen.published ai:proofs ai:pen.drafts');
    expect(registerClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: res.body.client_id, clientType: 'agent_connector', redirectUris: [REDIRECT] })
    );
    expect(registerClient.mock.calls[0][0].clientSecret).toBeUndefined();
  });
});

describe('connector authorize', () => {
  const base = {
    client_id: CONNECTOR,
    redirect_uri: REDIRECT,
    response_type: 'code',
    state: STATE,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    resource: MCP,
    scope: 'ai:files.published ai:pen.drafts',
  };

  it('302s to Unlock consent with PKCE, state and resource intact', async () => {
    getClient.mockResolvedValue(connectorClient());
    const res = await request(app()).get('/oauth/authorize').query(base);
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location);
    expect(`${to.origin}${to.pathname}`).toBe('https://unlock.parnoir.com/oauth/consent');
    expect(to.searchParams.get('client_id')).toBe(CONNECTOR);
    expect(to.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(to.searchParams.get('state')).toBe(STATE);
    expect(to.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('resource')).toBe(MCP);
    expect(to.searchParams.get('scope')).toBe('ai:files.published ai:pen.drafts');
    expect(to.searchParams.get('api_endpoint')).toBe('https://api.parnoir.com');
  });

  it('never redirects to an unregistered redirect_uri', async () => {
    getClient.mockResolvedValue(connectorClient());
    const res = await request(app()).get('/oauth/authorize').query({ ...base, redirect_uri: 'https://evil.example/cb' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_client');
  });

  it('missing PKCE, a plain challenge, a foreign resource or a private scope go back to the connector as errors', async () => {
    getClient.mockResolvedValue(connectorClient());
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [{ code_challenge: undefined, code_challenge_method: undefined }, 'invalid_request'],
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ resource: 'https://evil.example/mcp' }, 'invalid_target'],
      [{ scope: 'ai:files.private' }, 'invalid_scope'],
    ];
    for (const [over, error] of cases) {
      const query = Object.fromEntries(
        Object.entries({ ...base, ...over }).filter(([, v]) => v !== undefined)
      ) as Record<string, string>;
      const res = await request(app()).get('/oauth/authorize').query(query);
      expect(res.status).toBe(302);
      const back = new URL(res.headers.location);
      expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
      expect(back.searchParams.get('error')).toBe(error);
      expect(back.searchParams.get('state')).toBe(STATE);
    }
  });

  it('connectors always need PKCE at code mint and exchange', () => {
    expect(clientRequiresPkce(CONNECTOR)).toBe(true);
  });
});

describe('connector tokens', () => {
  function refreshRow(clientId = CONNECTOR) {
    responder = (sql) =>
      sql.includes('FROM oauth_refresh_tokens') && sql.trim().startsWith('SELECT')
        ? {
            rows: [
              {
                refresh_token: 'h',
                did: 'did:key:agent',
                public_key: null,
                client_id: clientId,
                scope: ['ai:files.published'],
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                family_id: 'fam',
                jti: 'j',
                used_at: null,
                replaced_by: null,
                revoked_at: null,
                reuse_detected_at: null,
              },
            ],
          }
        : { rows: [] };
  }

  it('form-encoded refresh grant mints a token whose audience is /mcp only', async () => {
    refreshRow();
    const res = await request(app())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'rt-1', client_id: CONNECTOR, resource: MCP });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.refresh_token).toBeTruthy();
    const token = res.body.access_token as string;

    expect(PNOAuthService.validateAccessToken(token)).toBeNull();
    expect(PNOAuthService.validateAccessToken(token, MCP)?.clientId).toBe(CONNECTOR);
    // Same answer from the signed JWT once the in-memory cache is gone.
    PNOAuthService.revokeAccessToken(token);
    expect(PNOAuthService.validateAccessToken(token)).toBeNull();
    expect(PNOAuthService.validateAccessToken(token, MCP)?.clientId).toBe(CONNECTOR);
  });

  it('refresh for another client is invalid_grant', async () => {
    refreshRow('pn-connector-someoneelse');
    const res = await request(app())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'rt-1', client_id: CONNECTOR });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('resource is only for connectors, and only the /mcp endpoint', async () => {
    const agent = await request(app())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'rt', client_id: 'pn-agent-mcp', resource: MCP });
    expect(agent.status).toBe(400);
    expect(agent.body.error).toBe('invalid_target');

    const foreign = await request(app())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'rt', client_id: CONNECTOR, resource: 'https://evil.example/mcp' });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toBe('invalid_target');
  });

  it('first-party refresh tokens keep the default audience', async () => {
    refreshRow('browser-app');
    const res = await request(app())
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'rt-2', client_id: 'browser-app' });
    expect(res.status).toBe(200);
    expect(PNOAuthService.validateAccessToken(res.body.access_token)?.clientId).toBe('browser-app');
    expect(PNOAuthService.validateAccessToken(res.body.access_token, MCP)).toBeNull();
  });
});
