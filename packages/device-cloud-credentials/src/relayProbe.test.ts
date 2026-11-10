import { describe, expect, it, vi } from 'vitest';
import { probeRelay } from './relayProbe.js';

const URL_ = 'https://relay.example';
const PREFIX = 'par-noir-pn-abc';

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Healthy relay backed by a map, with an optional failure injected per method. */
function relay(fail: Partial<Record<'GET' | 'PUT' | 'DELETE' | 'HEALTH', Response>> = {}) {
  const files = new Map<string, string>();
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? 'GET';
    if (u.pathname === '/v1/health') {
      return fail.HEALTH ?? json(200, { ok: true, protocol: 1, backend: 'sftp', prefix: PREFIX });
    }
    const failing = fail[method as 'GET' | 'PUT' | 'DELETE'];
    if (failing) return failing;
    const key = u.searchParams.get('key')!;
    if (method === 'PUT') {
      files.set(key, new TextDecoder().decode(init.body as Uint8Array));
      return new Response(null, { status: 200, headers: { etag: '"1"' } });
    }
    if (method === 'DELETE') {
      files.delete(key);
      return new Response(null, { status: 204 });
    }
    const body = files.get(key);
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('probeRelay', () => {
  it('passes health, write, read and delete', async () => {
    expect(await probeRelay({ url: URL_, token: 't', prefix: PREFIX, fetchImpl: relay() })).toEqual({
      ok: true,
      backend: 'sftp',
    });
  });

  it('names the cause of each failure', async () => {
    const cases: Array<[Parameters<typeof relay>[0], string, string]> = [
      [{ HEALTH: json(401, { error: 'unauthorized', message: 'bad token' }) }, 'health', 'bad_token'],
      [{ HEALTH: json(403, { error: 'origin_not_allowed', message: 'origin' }) }, 'health', 'origin_not_allowed'],
      [{ PUT: json(502, { error: 'backend_login_failed', message: 'login' }) }, 'write', 'backend_login_failed'],
      [{ PUT: json(502, { error: 'backend_permission_denied', message: 'denied' }) }, 'write', 'no_write_permission'],
    ];
    for (const [fail, step, cause] of cases) {
      expect(await probeRelay({ url: URL_, token: 't', prefix: PREFIX, fetchImpl: relay(fail) })).toMatchObject({
        ok: false,
        step,
        cause,
      });
    }
  });

  it('reports a blocked or unreachable relay, a wrong prefix and a non-https URL', async () => {
    const thrown = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await probeRelay({ url: URL_, token: 't', prefix: PREFIX, fetchImpl: thrown })).toMatchObject({
      cause: 'unreachable_or_cors',
    });
    expect(await probeRelay({ url: URL_, token: 't', prefix: 'other', fetchImpl: relay() })).toMatchObject({
      cause: 'prefix_mismatch',
    });
    expect(await probeRelay({ url: 'http://relay.example', token: 't', prefix: PREFIX, fetchImpl: relay() })).toMatchObject({
      cause: 'not_https',
    });
  });
});
