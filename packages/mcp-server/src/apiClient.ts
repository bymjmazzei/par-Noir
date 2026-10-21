import { AGENT_MCP_CLIENT_ID } from '@par-noir/standard-data-points';
import { McpToolError } from './errors';
import type { Logger } from './log';
import type { StoredTokens, TokenStore } from './tokenStore';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Refresh a little early so a call never races the expiry. */
const EXPIRY_SKEW_MS = 30_000;

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export function tokensFromResponse(
  body: Partial<TokenResponse>,
  apiUrl: string,
  now: number,
  fallbackRefresh?: string
): StoredTokens | null {
  const refreshToken = body.refresh_token || fallbackRefresh;
  if (typeof body.access_token !== 'string' || !refreshToken || typeof body.expires_in !== 'number') {
    return null;
  }
  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: now + body.expires_in * 1000,
    scopes: (body.scope || '').split(' ').filter(Boolean),
    apiUrl,
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await res.json()) as unknown;
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface AgentApiClientOptions {
  store: TokenStore;
  logger: Logger;
  fetch?: FetchLike;
  now?: () => number;
}

/** The only thing that talks to the par Noir API on behalf of the agent. */
export class AgentApiClient {
  private readonly store: TokenStore;
  private readonly logger: Logger;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private refreshing: Promise<StoredTokens> | null = null;

  constructor(opts: AgentApiClientOptions) {
    this.store = opts.store;
    this.logger = opts.logger;
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    this.now = opts.now ?? Date.now;
  }

  /** Scopes on the stored token; empty when signed out. */
  async grantedScopes(): Promise<string[]> {
    return (await this.store.load())?.scopes ?? [];
  }

  async requireScope(scope: string): Promise<void> {
    const tokens = await this.store.load();
    if (!tokens) throw new McpToolError('not_signed_in');
    if (!tokens.scopes.includes(scope)) throw new McpToolError('insufficient_scope');
  }

  /** `route` is a fixed label for logs; `path` may carry ids and never gets logged. */
  get(route: string, path: string): Promise<Record<string, unknown>> {
    return this.request(route, 'GET', path);
  }

  /** `body` is sent as JSON and never logged. */
  post(route: string, path: string, body: unknown): Promise<Record<string, unknown>> {
    return this.request(route, 'POST', path, body);
  }

  private async request(
    route: string,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    let tokens = await this.store.load();
    if (!tokens) throw new McpToolError('not_signed_in');
    if (tokens.expiresAt - EXPIRY_SKEW_MS <= this.now()) tokens = await this.refresh(tokens);

    let res = await this.send(tokens, method, path, body);
    if (res.status === 401) {
      tokens = await this.refresh(tokens);
      res = await this.send(tokens, method, path, body);
      if (res.status === 401) await this.revoked('unauthorized_after_refresh');
    }
    this.logger.info('api_call', { route, status: res.status });

    if (res.ok) return readJson(res);
    const error = await readJson(res);
    const code = typeof error.error === 'string' ? error.error : '';
    if (res.status === 403) {
      if (code === 'insufficient_scope') throw new McpToolError('insufficient_scope');
      await this.revoked(code === 'delegation_revoked' ? 'delegation_revoked' : 'forbidden');
    }
    if (res.status === 404) {
      if (code === 'not_attested') throw new McpToolError('not_attested');
      if (code === 'owner_key_missing') throw new McpToolError('owner_inbox_unavailable');
      throw new McpToolError('not_found');
    }
    if (res.status === 409 && code === 'owner_inbox_unavailable') throw new McpToolError('owner_inbox_unavailable');
    if (res.status === 410 && code === 'expired') throw new McpToolError('proof_expired');
    if (res.status === 413) throw new McpToolError('draft_too_large');
    if (res.status === 429) throw new McpToolError('draft_rate_limited');
    if (res.status === 400) throw new McpToolError('invalid_request');
    throw new McpToolError('unavailable');
  }

  private async send(tokens: StoredTokens, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await this.fetchImpl(`${tokens.apiUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new McpToolError('unavailable');
    }
  }

  private refresh(tokens: StoredTokens): Promise<StoredTokens> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh(tokens).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(tokens: StoredTokens): Promise<StoredTokens> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${tokens.apiUrl}/oauth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refreshToken, client_id: AGENT_MCP_CLIENT_ID }),
      });
    } catch {
      throw new McpToolError('unavailable');
    }
    const body = await readJson(res);
    if (res.status === 400 || res.status === 401) {
      return this.revoked(body.error === 'invalid_grant' ? 'invalid_grant' : 'refresh_rejected');
    }
    if (!res.ok) throw new McpToolError('unavailable');
    const next = tokensFromResponse(body as Partial<TokenResponse>, tokens.apiUrl, this.now(), tokens.refreshToken);
    if (!next) throw new McpToolError('unavailable');
    await this.store.save(next);
    this.logger.info('token_refreshed');
    return next;
  }

  private async revoked(reason: string): Promise<never> {
    await this.store.clear();
    this.logger.warn('access_revoked', { reason });
    throw new McpToolError('access_revoked');
  }
}
