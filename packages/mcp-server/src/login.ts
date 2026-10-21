import { createHash, randomBytes } from 'node:crypto';
import {
  AGENT_MCP_CLIENT_ID,
  AGENT_MCP_REDIRECT_URI,
  AI_SCOPES,
} from '@par-noir/standard-data-points';
import { tokensFromResponse, type FetchLike, type TokenResponse } from './apiClient';
import { McpToolError } from './errors';
import type { Logger } from './log';
import type { TokenStore } from './tokenStore';

export const AGENT_LOGIN_SCOPE = ['openid', ...Object.values(AI_SCOPES)].join(' ');

/** Just under the API's two-minute broker-pending window. */
const LOGIN_TIMEOUT_MS = 110_000;
const POLL_INTERVAL_MS = 1_500;

const b64url = (buf: Buffer) => buf.toString('base64url');

export function createPkcePair(random: (n: number) => Buffer = randomBytes): { verifier: string; challenge: string } {
  const verifier = b64url(random(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildUnlockLoginUrl(args: { apiUrl: string; state: string; nonce: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: AGENT_MCP_CLIENT_ID,
    redirect_uri: AGENT_MCP_REDIRECT_URI,
    response_type: 'code',
    scope: AGENT_LOGIN_SCOPE,
    state: args.state,
    nonce: args.nonce,
    api_endpoint: args.apiUrl,
    popup: 'false',
    code_challenge: args.challenge,
    code_challenge_method: 'S256',
  });
  return `com.parnoir.unlock://oauth/consent?${params.toString()}`;
}

export interface LoginDeps {
  apiUrl: string;
  store: TokenStore;
  logger: Logger;
  openUrl: (url: string) => Promise<void>;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: (n: number) => Buffer;
  timeoutMs?: number;
  intervalMs?: number;
}

async function waitForCode(deps: LoginDeps, state: string, fetchImpl: FetchLike): Promise<string> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + (deps.timeoutMs ?? LOGIN_TIMEOUT_MS);
  const q = new URLSearchParams({ state, client_id: AGENT_MCP_CLIENT_ID });
  while (now() < deadline) {
    let res: Response | null = null;
    try {
      res = await fetchImpl(`${deps.apiUrl}/oauth/authorize/broker-pending?${q.toString()}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      res = null;
    }
    if (res && res.status === 200) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.state !== state || typeof body.code !== 'string' || !body.code) {
        throw new McpToolError('login_failed');
      }
      return body.code;
    }
    if (res && res.status !== 204) throw new McpToolError('login_failed');
    await sleep(deps.intervalMs ?? POLL_INTERVAL_MS);
  }
  throw new McpToolError('login_timeout');
}

/** Unlock signs the agent in; the code comes back through the broker and is bound to our PKCE verifier. */
export async function login(deps: LoginDeps): Promise<{ scopes: string[] }> {
  const fetchImpl = deps.fetch ?? ((url, init) => fetch(url, init));
  const random = deps.random ?? randomBytes;
  const { verifier, challenge } = createPkcePair(random);
  const state = random(16).toString('hex');
  const nonce = random(16).toString('hex');

  await deps.openUrl(buildUnlockLoginUrl({ apiUrl: deps.apiUrl, state, nonce, challenge }));
  deps.logger.info('login_waiting');
  const code = await waitForCode(deps, state, fetchImpl);

  let res: Response;
  try {
    res = await fetchImpl(`${deps.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: AGENT_MCP_CLIENT_ID,
        redirect_uri: AGENT_MCP_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
  } catch {
    throw new McpToolError('unavailable');
  }
  if (!res.ok) throw new McpToolError('login_failed');
  const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse>;
  const tokens = tokensFromResponse(body, deps.apiUrl, (deps.now ?? Date.now)());
  if (!tokens) throw new McpToolError('login_failed');
  await deps.store.save(tokens);
  deps.logger.info('login_ok', { scopes: tokens.scopes.length });
  return { scopes: tokens.scopes };
}

/** Best effort: the server forgets the tokens, and the Keychain is cleared either way. */
export async function logout(deps: { store: TokenStore; fetch?: FetchLike }): Promise<boolean> {
  const tokens = await deps.store.load();
  await deps.store.clear();
  if (!tokens) return false;
  const fetchImpl = deps.fetch ?? ((url, init) => fetch(url, init));
  for (const [token, hint] of [
    [tokens.refreshToken, 'refresh_token'],
    [tokens.accessToken, 'access_token'],
  ] as const) {
    await fetchImpl(`${tokens.apiUrl}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, token_type_hint: hint }),
    }).catch(() => undefined);
  }
  return true;
}
