import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AgentApiClient, type FetchLike } from '../apiClient';
import { createApiSource } from '../apiSource';
import { AgentCustodyClient } from '../custodyClient';
import { createLogger } from '../log';
import { createPnMcpServer } from '../server';
import { MemoryTokenStore, type StoredTokens } from '../tokenStore';

export const API = 'https://api.test';
export const NOW = 1_800_000_000_000;

/** Fake sensitive values. None may appear in tool output or logs. */
export const SECRETS = {
  pnIdentifier: 'pn-owner-secret-7f3a',
  did: 'did:pn:owner-secret-did',
  email: 'owner.secret@example.com',
  key2: 'key2-hunter2-secret',
  key1: 'key1-secret-owner',
  accessToken: 'at-secret-access-token',
  refreshToken: 'rt-secret-refresh-token',
  newAccessToken: 'at-secret-rotated-access',
  newRefreshToken: 'rt-secret-rotated-refresh',
  age: '9137',
  birthdate: '1931-07-09',
} as const;

export const ALL_SCOPES = ['openid', 'ai:files.published', 'ai:pen.published', 'ai:proofs'];

export function tokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    accessToken: SECRETS.accessToken,
    refreshToken: SECRETS.refreshToken,
    expiresAt: NOW + 3_600_000,
    scopes: ALL_SCOPES,
    apiUrl: API,
    ...overrides,
  };
}

/** Extra fields an API bug could leak; the allowlist projection must drop them. */
export const LEAKY = {
  authorDid: SECRETS.did,
  pnIdentifier: SECRETS.pnIdentifier,
  email: SECRETS.email,
  key2: SECRETS.key2,
  key1: SECRETS.key1,
  age: Number(SECRETS.age),
  dateOfBirth: SECRETS.birthdate,
  accessToken: SECRETS.accessToken,
};

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

export function fakeFetch(route: Route) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    return route(u, init);
  };
  return { fetch, calls };
}

export async function connect(opts: {
  store: MemoryTokenStore;
  fetch: FetchLike;
  /** Socket path for par Noir Unlock; omitted means remote-style deps with no custody at all. */
  unlockSocket?: string;
}) {
  const logs: string[] = [];
  const logger = createLogger((line) => logs.push(line));
  const client = new AgentApiClient({ store: opts.store, logger, fetch: opts.fetch, now: () => NOW });
  const custody = opts.unlockSocket
    ? new AgentCustodyClient({ socketPath: opts.unlockSocket, accessToken: () => client.accessToken(), timeoutMs: 2000 })
    : undefined;
  const server = await createPnMcpServer({ source: createApiSource(client, custody), mode: 'local', logger });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
  return { mcp, logs, close: () => mcp.close() };
}

export function assertNoSecrets(...outputs: unknown[]) {
  const haystack = outputs.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n');
  for (const [name, value] of Object.entries(SECRETS)) {
    if (haystack.includes(value)) throw new Error(`sensitive value leaked: ${name}`);
  }
}
