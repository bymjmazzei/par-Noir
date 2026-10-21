import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from '../config';
import { createLogger } from '../log';
import { buildUnlockLoginUrl, createPkcePair, login, logout } from '../login';
import { MemoryTokenStore, parseStoredTokens } from '../tokenStore';
import { API, NOW, SECRETS, assertNoSecrets, fakeFetch, json, tokens } from './helpers';

const CODE = 'auth-code-secret-xyz';

function deps(route: Parameters<typeof fakeFetch>[0]) {
  const api = fakeFetch(route);
  const logs: string[] = [];
  const opened: string[] = [];
  let clock = NOW;
  const store = new MemoryTokenStore();
  return {
    api,
    logs,
    opened,
    store,
    run: () =>
      login({
        apiUrl: API,
        store,
        logger: createLogger((l) => logs.push(l)),
        openUrl: async (u) => {
          opened.push(u);
        },
        fetch: api.fetch,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        timeoutMs: 10_000,
        intervalMs: 1_000,
      }),
  };
}

describe('PKCE', () => {
  it('creates an S256 pair the API accepts', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('sends the challenge, never the verifier, to Unlock', () => {
    const { verifier, challenge } = createPkcePair();
    const url = new URL(buildUnlockLoginUrl({ apiUrl: API, state: 's1', nonce: 'n1', challenge }));
    expect(url.protocol).toBe('com.parnoir.unlock:');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'pn-agent-mcp',
      redirect_uri: 'https://unlock.parnoir.com/oauth/agent-complete',
      response_type: 'code',
      scope: 'openid ai:files.published ai:pen.published ai:proofs ai:pen.drafts ai:files.private ai:pen.private',
      state: 's1',
      nonce: 'n1',
      api_endpoint: API,
      popup: 'false',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    expect(url.toString()).not.toContain(verifier);
  });
});

describe('login', () => {
  it('waits on the broker, exchanges the code with the verifier, and stores tokens', async () => {
    let polls = 0;
    let state = '';
    const d = deps((url, init) => {
      if (url.pathname === '/oauth/authorize/broker-pending') {
        expect(url.searchParams.get('client_id')).toBe('pn-agent-mcp');
        state = url.searchParams.get('state') || '';
        return ++polls < 3 ? new Response(null, { status: 204 }) : json(200, { code: CODE, state });
      }
      if (url.pathname === '/oauth/token') {
        const body = JSON.parse(String(init?.body));
        const challenge = new URL(d.opened[0]).searchParams.get('code_challenge');
        expect(body).toMatchObject({ grant_type: 'authorization_code', code: CODE, client_id: 'pn-agent-mcp' });
        expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(challenge);
        return json(200, {
          access_token: SECRETS.accessToken,
          refresh_token: SECRETS.refreshToken,
          expires_in: 3600,
          scope: 'openid ai:files.published',
        });
      }
      return json(404);
    });

    await expect(d.run()).resolves.toEqual({ scopes: ['openid', 'ai:files.published'] });
    expect(new URL(d.opened[0]).searchParams.get('state')).toBe(state);
    expect(await d.store.load()).toMatchObject({
      accessToken: SECRETS.accessToken,
      refreshToken: SECRETS.refreshToken,
      apiUrl: API,
    });
    assertNoSecrets(d.logs);
    expect(d.logs.join('\n')).not.toContain(CODE);
  });

  it('refuses a broker payload for a different state', async () => {
    const d = deps((url) =>
      url.pathname === '/oauth/authorize/broker-pending' ? json(200, { code: CODE, state: 'someone-else' }) : json(500)
    );
    await expect(d.run()).rejects.toMatchObject({ code: 'login_failed' });
    expect(d.api.calls.some((c) => c.url.pathname === '/oauth/token')).toBe(false);
    expect(await d.store.load()).toBeNull();
  });

  it('times out when Unlock never finishes', async () => {
    const d = deps(() => new Response(null, { status: 204 }));
    await expect(d.run()).rejects.toMatchObject({ code: 'login_timeout' });
    expect(await d.store.load()).toBeNull();
  });

  it('stores nothing when the exchange is refused', async () => {
    const d = deps((url) =>
      url.pathname === '/oauth/authorize/broker-pending'
        ? json(200, { code: CODE, state: url.searchParams.get('state') })
        : json(400, { error: 'invalid_grant' })
    );
    await expect(d.run()).rejects.toMatchObject({ code: 'login_failed' });
    expect(await d.store.load()).toBeNull();
  });
});

describe('logout', () => {
  it('clears the Keychain and asks the API to revoke both tokens', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch(() => json(200, { revoked: true }));
    await expect(logout({ store, fetch: api.fetch })).resolves.toBe(true);
    expect(await store.load()).toBeNull();
    expect(api.calls.map((c) => JSON.parse(String(c.init?.body)).token_type_hint)).toEqual([
      'refresh_token',
      'access_token',
    ]);
  });

  it('still clears when the API is unreachable', async () => {
    const store = new MemoryTokenStore(tokens());
    await logout({ store, fetch: async () => Promise.reject(new Error('offline')) });
    expect(await store.load()).toBeNull();
  });
});

describe('config and storage', () => {
  it('accepts https and loopback http only', () => {
    expect(resolveApiUrl({})).toBe('https://api.parnoir.com');
    expect(resolveApiUrl({ PN_API_URL: 'https://api.example.com/' })).toBe('https://api.example.com');
    expect(resolveApiUrl({ PN_API_URL: 'http://localhost:3001' })).toBe('http://localhost:3001');
    expect(() => resolveApiUrl({ PN_API_URL: 'http://api.example.com' })).toThrow(/https/);
  });

  it('ignores malformed Keychain contents', () => {
    expect(parseStoredTokens('not json')).toBeNull();
    expect(parseStoredTokens(JSON.stringify({ accessToken: 'a' }))).toBeNull();
    expect(parseStoredTokens(JSON.stringify(tokens()))).toEqual(tokens());
  });
});
