/**
 * Verify an AI agent's access token locally against the API's published signing keys
 * before Unlock spends a Touch ID prompt on it. The API still re-validates the token
 * when Unlock asks for the delegation status.
 */

import { AGENT_MCP_CLIENT_ID, filterKnownAiScopes, type AiScope } from '@par-noir/standard-data-points';
import { AgentCustodyError } from './errors';

export type AgentTokenClaims = {
  agentPnIdentifier: string;
  scopes: AiScope[];
  expiresAtMs: number;
};

type Jwk = { kty?: string; kid?: string; n?: string; e?: string; x5c?: unknown };

/** Signing key for a JWT `kid`, or null when the API does not publish it. */
export type AgentJwksSource = (kid: string | undefined) => Promise<CryptoKey | null>;

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_MISS_REFETCH_MS = 30 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importJwk(jwk: Jwk): Promise<CryptoKey | null> {
  if (jwk.kty !== 'RSA') return null;
  if (jwk.n && jwk.e) {
    return crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      RS256,
      false,
      ['verify']
    );
  }
  const first = Array.isArray(jwk.x5c) ? jwk.x5c[0] : null;
  if (typeof first !== 'string' || !first) return null;
  // The API publishes base64 of its PEM public key here.
  const pem = new TextDecoder().decode(b64ToBytes(first));
  const body = pem.match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/)?.[1];
  if (!body) return null;
  return crypto.subtle.importKey('spki', b64ToBytes(body.replace(/\s+/g, '')) as BufferSource, RS256, false, [
    'verify',
  ]);
}

/** Cached `/.well-known/jwks.json`; refetched on TTL or on an unknown `kid` (rotation). */
export function createAgentJwksSource(opts: {
  apiEndpoint: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): AgentJwksSource {
  const now = opts.now ?? Date.now;
  let fetchedAt = 0;
  let keys: Array<{ kid: string | undefined; key: CryptoKey }> = [];

  const load = async () => {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${opts.apiEndpoint.replace(/\/$/, '')}/.well-known/jwks.json`);
    if (!res.ok) throw new AgentCustodyError('unavailable');
    const body = (await res.json()) as { keys?: Jwk[] };
    const next: typeof keys = [];
    for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
      const key = await importJwk(jwk).catch(() => null);
      if (key) next.push({ kid: jwk.kid, key });
    }
    keys = next;
    fetchedAt = now();
  };

  const pick = (kid: string | undefined) =>
    keys.find((k) => k.kid === kid)?.key ?? (keys.length === 1 && !kid ? keys[0]!.key : null);

  return async (kid) => {
    if (!fetchedAt || now() - fetchedAt > JWKS_TTL_MS) await load();
    let key = pick(kid);
    if (!key && now() - fetchedAt > JWKS_MISS_REFETCH_MS) {
      await load();
      key = pick(kid);
    }
    return key;
  };
}

function parseJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Signature, expiry and client checks. Any failure is `access_revoked`; no detail leaves Unlock. */
export async function verifyAgentAccessToken(
  token: string,
  jwks: AgentJwksSource,
  nowMs: number = Date.now()
): Promise<AgentTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AgentCustodyError('access_revoked');
  const [h, p, s] = parts as [string, string, string];
  const header = parseJson(h);
  const payload = parseJson(p);
  if (!header || !payload || header.alg !== 'RS256') throw new AgentCustodyError('access_revoked');

  const key = await jwks(typeof header.kid === 'string' ? header.kid : undefined);
  if (!key) throw new AgentCustodyError('access_revoked');
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      RS256,
      key,
      b64urlToBytes(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new AgentCustodyError('access_revoked');

  const expMs =
    typeof payload.exp === 'number'
      ? payload.exp * 1000
      : typeof payload.expiresAt === 'number'
        ? payload.expiresAt
        : NaN;
  if (!Number.isFinite(expMs) || expMs <= nowMs) throw new AgentCustodyError('access_revoked');
  if (payload.clientId !== AGENT_MCP_CLIENT_ID) throw new AgentCustodyError('access_revoked');
  const pn = typeof payload.pnIdentifier === 'string' ? payload.pnIdentifier.trim() : '';
  if (!pn) throw new AgentCustodyError('access_revoked');

  const rawScope = payload.scope;
  const scopeList = Array.isArray(rawScope)
    ? rawScope.filter((x): x is string => typeof x === 'string')
    : typeof rawScope === 'string'
      ? rawScope.split(/\s+/)
      : [];
  return {
    agentPnIdentifier: pn.startsWith('pn-') ? pn : `pn-${pn}`,
    scopes: filterKnownAiScopes(scopeList),
    expiresAtMs: expMs,
  };
}
