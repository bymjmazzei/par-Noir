/**
 * OAuth for hosted AI connectors (claude.ai, ChatGPT and the like) that reach par Noir
 * through the remote /mcp endpoint:
 *  - discovery: RFC 9728 protected resource metadata, RFC 8414 authorization server metadata
 *  - RFC 7591 dynamic client registration of public `agent_connector` clients
 *  - the authorize step, which 302s to Unlock consent with PKCE, state and resource intact
 *
 * Connectors are public clients: PKCE S256 always, only ai: scopes that work without the
 * owner's local Unlock, and access tokens whose audience is /mcp (see PNOAuthService.audienceFor).
 * They sign in AI agent sub-pNs only; the owner's root identity never authorizes one.
 */
import crypto from 'crypto';
import type { Application, Request, RequestHandler, Response } from 'express';
import {
  AGENT_CONNECTOR_CLIENT_ID_PREFIX,
  AGENT_MCP_CLIENT_ID,
  REMOTE_AI_SCOPES,
} from '@par-noir/standard-data-points';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { isMcpResource, mcpResourceUrl, publicApiBaseUrl } from './mcpResource';
import { normalizePkceChallenge } from './pnOAuthService';

const CONNECTOR_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_REDIRECT_URIS = 5;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 100;
const MIN_STATE_LENGTH = 8;
const MAX_STATE_LENGTH = 512;

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [publicApiBaseUrl()],
    scopes_supported: [...REMOTE_AI_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'par Noir',
  };
}

export function authorizationServerMetadata() {
  const base = publicApiBaseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    jwks_uri: `${base}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: [...CONNECTOR_GRANT_TYPES],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...REMOTE_AI_SCOPES],
  };
}

/** https anywhere, plain http only on loopback (RFC 8252). No wildcards, fragments or userinfo. */
export function isAllowedConnectorRedirectUri(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > MAX_REDIRECT_URI_LENGTH) return false;
  if (raw.includes('*') || raw.includes('#')) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  return false;
}

export interface ConnectorRegistration {
  clientName: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
}

type RegistrationError = 'invalid_redirect_uri' | 'invalid_client_metadata';

export type ParsedRegistration =
  | { ok: true; value: ConnectorRegistration }
  | { ok: false; error: RegistrationError; description: string };

function fail(error: RegistrationError, description: string): ParsedRegistration {
  return { ok: false, error, description };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function parseConnectorRegistration(body: unknown): ParsedRegistration {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('invalid_client_metadata', 'Registration body must be a JSON object');
  }
  const meta = body as Record<string, unknown>;

  const redirectUris = meta.redirect_uris;
  if (!isStringArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    return fail('invalid_redirect_uri', `redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URIs`);
  }
  if (!redirectUris.every(isAllowedConnectorRedirectUri)) {
    return fail('invalid_redirect_uri', 'redirect_uris must be https, or http on a loopback address');
  }

  const authMethod = meta.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== 'none') {
    return fail('invalid_client_metadata', 'Connectors are public clients: token_endpoint_auth_method must be none');
  }

  const grantTypes = meta.grant_types ?? ['authorization_code', 'refresh_token'];
  if (
    !isStringArray(grantTypes) ||
    !grantTypes.includes('authorization_code') ||
    !grantTypes.every((g) => CONNECTOR_GRANT_TYPES.includes(g))
  ) {
    return fail('invalid_client_metadata', 'grant_types must be authorization_code, optionally with refresh_token');
  }

  const responseTypes = meta.response_types ?? ['code'];
  if (!isStringArray(responseTypes) || !responseTypes.every((r) => r === 'code')) {
    return fail('invalid_client_metadata', 'response_types must be code');
  }

  let scopes: string[] = [...REMOTE_AI_SCOPES];
  if (meta.scope !== undefined) {
    if (typeof meta.scope !== 'string') return fail('invalid_client_metadata', 'scope must be a string');
    scopes = Array.from(new Set(meta.scope.split(' ').filter(Boolean)));
    if (scopes.length === 0 || !scopes.every((s) => (REMOTE_AI_SCOPES as readonly string[]).includes(s))) {
      return fail('invalid_client_metadata', `scope may only include: ${REMOTE_AI_SCOPES.join(' ')}`);
    }
  }

  const rawName = typeof meta.client_name === 'string' ? meta.client_name : '';
  const clientName = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CLIENT_NAME_LENGTH) || 'AI connector';

  return { ok: true, value: { clientName, redirectUris, scopes, grantTypes: Array.from(new Set(grantTypes)) } };
}

/** pn-agent-mcp, or a connector that registered and is still active. */
export async function isAgentClassClient(clientId: unknown): Promise<boolean> {
  if (typeof clientId !== 'string' || !clientId) return false;
  if (clientId === AGENT_MCP_CLIENT_ID) return true;
  if (!clientId.startsWith(AGENT_CONNECTOR_CLIENT_ID_PREFIX)) return false;
  const { ClientRegistrationService } = await import('./clientRegistration');
  return ClientRegistrationService.isActiveAgentConnector(clientId);
}

export type ConnectorAuthorizeOutcome =
  | { kind: 'redirect'; location: string }
  | { kind: 'error'; status: number; body: { error: string; error_description: string } };

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Validate a connector's authorize request and send the owner to Unlock consent. Until the
 * redirect_uri is known to belong to the client, errors are JSON; after that they go back to
 * the connector with `error` and `state` (RFC 6749 4.1.2.1).
 */
export async function resolveConnectorAuthorize(query: Record<string, unknown>): Promise<ConnectorAuthorizeOutcome> {
  const clientId = queryString(query.client_id);
  const redirectUri = queryString(query.redirect_uri);
  if (!clientId || !redirectUri) {
    return {
      kind: 'error',
      status: 400,
      body: { error: 'invalid_request', error_description: 'client_id and redirect_uri are required' },
    };
  }

  const { ClientRegistrationService } = await import('./clientRegistration');
  const client = await ClientRegistrationService.getClient(clientId);
  if (
    !client ||
    !client.isActive ||
    client.clientType !== 'agent_connector' ||
    !client.redirectUris.includes(redirectUri)
  ) {
    return {
      kind: 'error',
      status: 400,
      body: { error: 'invalid_client', error_description: 'Invalid client_id or redirect_uri' },
    };
  }

  const state = queryString(query.state);
  const back = (error: string, description: string): ConnectorAuthorizeOutcome => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state) url.searchParams.set('state', state);
    return { kind: 'redirect', location: url.toString() };
  };

  if (query.response_type !== 'code') {
    return back('unsupported_response_type', 'Only response_type=code is supported');
  }
  if (state.length < MIN_STATE_LENGTH || state.length > MAX_STATE_LENGTH) {
    return back('invalid_request', 'state is required');
  }

  let codeChallenge: string | null;
  try {
    codeChallenge = normalizePkceChallenge(query.code_challenge, query.code_challenge_method);
  } catch {
    codeChallenge = null;
  }
  if (!codeChallenge) {
    return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }

  if (query.resource !== undefined && !isMcpResource(query.resource)) {
    return back('invalid_target', 'resource must be the par Noir MCP endpoint');
  }

  const allowed = client.scopes ?? [];
  const requested = queryString(query.scope).split(' ').filter(Boolean);
  const scopes = requested.length > 0 ? requested : allowed;
  if (
    scopes.length === 0 ||
    !scopes.every((s) => allowed.includes(s) && (REMOTE_AI_SCOPES as readonly string[]).includes(s))
  ) {
    return back('invalid_scope', 'One or more requested scopes are not allowed for this connector');
  }

  const unlockOrigin = (process.env.PN_UNLOCK_ORIGIN || 'https://unlock.parnoir.com').replace(/\/$/, '');
  const consent = new URL(`${unlockOrigin}/oauth/consent`);
  consent.searchParams.set('client_id', clientId);
  consent.searchParams.set('redirect_uri', redirectUri);
  consent.searchParams.set('api_endpoint', publicApiBaseUrl());
  consent.searchParams.set('scope', scopes.join(' '));
  consent.searchParams.set('state', state);
  consent.searchParams.set('code_challenge', codeChallenge);
  consent.searchParams.set('code_challenge_method', 'S256');
  consent.searchParams.set('resource', mcpResourceUrl());
  return { kind: 'redirect', location: consent.toString() };
}

export interface AgentConnectorRouteDeps {
  registerLimiter: RequestHandler;
}

export function registerAgentConnectorRoutes(app: Application, deps: AgentConnectorRouteDeps): void {
  const sendResourceMetadata = (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(protectedResourceMetadata());
  };
  app.get('/.well-known/oauth-protected-resource', sendResourceMetadata);
  app.get('/.well-known/oauth-protected-resource/mcp', sendResourceMetadata);

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(authorizationServerMetadata());
  });

  app.post('/oauth/register', deps.registerLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const parsed = parseConnectorRegistration(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error, error_description: parsed.description });
    }
    const { clientName, redirectUris, scopes, grantTypes } = parsed.value;
    const clientId = `${AGENT_CONNECTOR_CLIENT_ID_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
    try {
      const { ClientRegistrationService } = await import('./clientRegistration');
      await ClientRegistrationService.registerClient({
        clientId,
        name: clientName,
        description: 'AI connector (dynamic client registration)',
        redirectUris,
        scopes,
        isActive: true,
        clientType: 'agent_connector',
      });
    } catch (error: unknown) {
      safeLogger.warn('[connector] registration failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'server_error', error_description: 'Registration failed' });
    }
    safeLogger.info('[connector] registered', { clientHash: hashIdentifier(clientId) });
    return res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: scopes.join(' '),
    });
  });
}
