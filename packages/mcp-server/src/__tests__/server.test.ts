import { describe, expect, it } from 'vitest';
import { MemoryTokenStore } from '../tokenStore';
import {
  ALL_SCOPES,
  LEAKY,
  NOW,
  SECRETS,
  assertNoSecrets,
  connect,
  fakeFetch,
  json,
  tokens,
} from './helpers';

const FILE = {
  fileId: 'file-1',
  title: 'Spring notes',
  description: 'Published essay',
  fileType: 'text',
  contentClass: 'text_post',
  tags: ['garden', 42, 'notes'],
  publishedAt: '2026-04-01T00:00:00.000Z',
};

const okApi = fakeFetch((url) => {
  if (url.pathname === '/api/agent/files/search') return json(200, { files: [{ ...FILE, ...LEAKY }] });
  if (url.pathname === '/api/agent/files/file-1')
    return json(200, { file: { ...FILE, ...LEAKY, text: 'Hello garden', textTruncated: false } });
  if (url.pathname === '/api/agent/pen/doc-1')
    return json(200, {
      document: {
        docId: 'doc-1',
        fileId: 'file-9',
        title: 'Draft one',
        description: '',
        publishedAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        text: 'Pen body',
        textTruncated: true,
        ...LEAKY,
      },
    });
  return json(404, { error: 'not_found' });
});

describe('tool listing and schemas', () => {
  it('lists the read-only tools with input and output schemas', async () => {
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: okApi.fetch });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'prove_data_point',
      'read_file',
      'read_pen_document',
      'search_my_files',
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.outputSchema?.type).toBe('object');
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName.search_my_files.inputSchema.properties ?? {}).sort()).toEqual(['limit', 'query']);
    expect(byName.read_file.inputSchema.required).toEqual(['fileId']);
    expect(byName.read_pen_document.inputSchema.required).toEqual(['docId']);
    expect(byName.prove_data_point.inputSchema.required).toEqual(['dataPointId']);
    const idSchema = (byName.prove_data_point.inputSchema.properties as Record<string, { enum?: string[] }>).dataPointId;
    expect(idSchema.enum).toEqual(['over_18', 'over_21', 'name_attestation', 'email_verification', 'phone_verification', 'location_verification']);
    expect(Object.keys(byName.prove_data_point.outputSchema?.properties ?? {}).sort()).toEqual(
      ['dataPointId', 'expiresAt', 'level', 'satisfied']
    );
    await close();
  });

  it('only lists tools whose scope is on the token', async () => {
    const store = new MemoryTokenStore(tokens({ scopes: ['openid', 'ai:files.published'] }));
    const { mcp, close } = await connect({ store, fetch: okApi.fetch });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['read_file', 'search_my_files']);
    await close();
  });

  it('lists nothing when no agent is signed in', async () => {
    const { mcp, close } = await connect({ store: new MemoryTokenStore(null), fetch: okApi.fetch });
    await expect(mcp.listTools()).rejects.toThrow();
    await close();
  });

  it('rejects input outside the schema without calling the API', async () => {
    const api = fakeFetch(() => json(200, { files: [] }));
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: api.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: { query: 'x', limit: 500 } });
    expect(res.isError).toBe(true);
    expect(api.calls).toHaveLength(0);
    await close();
  });
});

describe('tool output is an allowlist', () => {
  it('search_my_files returns only summary fields', async () => {
    const { mcp, logs, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: okApi.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: { query: 'garden' } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ files: [{ ...FILE, tags: ['garden', 'notes'] }] });
    assertNoSecrets(res, logs);
    await close();
  });

  it('read_file and read_pen_document drop everything not named', async () => {
    const { mcp, logs, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: okApi.fetch });
    const file = await mcp.callTool({ name: 'read_file', arguments: { fileId: 'file-1' } });
    expect(Object.keys((file.structuredContent as { file: object }).file).sort()).toEqual(
      ['contentClass', 'description', 'fileId', 'fileType', 'publishedAt', 'tags', 'text', 'textTruncated', 'title']
    );
    const doc = await mcp.callTool({ name: 'read_pen_document', arguments: { docId: 'doc-1' } });
    expect(doc.structuredContent).toEqual({
      document: {
        docId: 'doc-1',
        fileId: 'file-9',
        title: 'Draft one',
        description: '',
        publishedAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        text: 'Pen body',
        textTruncated: true,
      },
    });
    assertNoSecrets(file, doc, logs);
    await close();
  });

  it('never echoes API error bodies', async () => {
    const api = fakeFetch(() =>
      json(500, { error: 'boom', error_description: `failed for ${SECRETS.pnIdentifier} ${SECRETS.email}` })
    );
    const { mcp, logs, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: api.fetch });
    const res = await mcp.callTool({ name: 'read_file', arguments: { fileId: 'file-1' } });
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: 'text', text: 'par Noir is unavailable right now. Try again shortly.' }]);
    assertNoSecrets(res, logs);
    await close();
  });

  it('maps 404 to a fixed message', async () => {
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: okApi.fetch });
    const res = await mcp.callTool({ name: 'read_file', arguments: { fileId: 'missing' } });
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: 'text', text: 'Nothing published with that id.' }]);
    await close();
  });
});

describe('scope enforcement', () => {
  it('re-checks the scope on every call', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch(() => json(200, { document: {} }));
    const { mcp, close } = await connect({ store, fetch: api.fetch });
    await store.save(tokens({ scopes: ['openid', 'ai:files.published'] }));
    const res = await mcp.callTool({ name: 'read_pen_document', arguments: { docId: 'doc-1' } });
    expect(res.isError).toBe(true);
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/does not have access/);
    expect(api.calls).toHaveLength(0);
    await close();
  });

  it('surfaces the API refusing a scope', async () => {
    const api = fakeFetch(() => json(403, { error: 'insufficient_scope' }));
    const store = new MemoryTokenStore(tokens());
    const { mcp, close } = await connect({ store, fetch: api.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(res.isError).toBe(true);
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/does not have access/);
    expect(await store.load()).not.toBeNull();
    await close();
  });
});

describe('prove_data_point', () => {
  const proofApi = fakeFetch((url) => {
    if (url.pathname === '/api/agent/proofs/over_21')
      return json(200, {
        dataPointId: 'over_21',
        satisfied: true,
        level: 'verified',
        expiresAt: '2027-10-21T13:00:00.000Z',
        ...LEAKY,
        value: SECRETS.birthdate,
        proof: { public_inputs: { age_bucket: '30_39', dob: SECRETS.birthdate } },
      });
    if (url.pathname === '/api/agent/proofs/over_18')
      return json(200, { dataPointId: 'over_21', satisfied: true, level: 'verified', expiresAt: null });
    if (url.pathname === '/api/agent/proofs/phone_verification') return json(404, { error: 'not_attested' });
    if (url.pathname === '/api/agent/proofs/email_verification') return json(410, { error: 'expired' });
    return json(404, { error: 'not_found' });
  });

  it('returns exactly the four fields and never the raw age or birthdate', async () => {
    const { mcp, logs, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: proofApi.fetch });
    const res = await mcp.callTool({ name: 'prove_data_point', arguments: { dataPointId: 'over_21' } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      dataPointId: 'over_21',
      satisfied: true,
      level: 'verified',
      expiresAt: '2027-10-21T13:00:00.000Z',
    });
    assertNoSecrets(res, logs);
    expect(JSON.stringify(res)).not.toContain('30_39');
    await close();
  });

  it('refuses an answer for a different data point than asked', async () => {
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: proofApi.fetch });
    const res = await mcp.callTool({ name: 'prove_data_point', arguments: { dataPointId: 'over_18' } });
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: 'text', text: 'par Noir is unavailable right now. Try again shortly.' }]);
    await close();
  });

  it('maps not attested and expired to fixed messages', async () => {
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: proofApi.fetch });
    const missing = await mcp.callTool({ name: 'prove_data_point', arguments: { dataPointId: 'phone_verification' } });
    expect(missing.content).toEqual([{ type: 'text', text: 'The owner has not shared that proof with this AI agent.' }]);
    const expired = await mcp.callTool({ name: 'prove_data_point', arguments: { dataPointId: 'email_verification' } });
    expect(expired.content).toEqual([
      { type: 'text', text: 'That proof has expired. The owner can renew it in Dashboard, Privacy.' },
    ]);
    await close();
  });

  it('rejects ids outside the attestable list without calling the API', async () => {
    const api = fakeFetch(() => json(200, {}));
    const { mcp, close } = await connect({ store: new MemoryTokenStore(tokens()), fetch: api.fetch });
    const res = await mcp.callTool({ name: 'prove_data_point', arguments: { dataPointId: 'age_attestation' } });
    expect(res.isError).toBe(true);
    expect(api.calls).toHaveLength(0);
    await close();
  });

  it('is not listed without ai:proofs', async () => {
    const store = new MemoryTokenStore(tokens({ scopes: ['openid', 'ai:files.published', 'ai:pen.published'] }));
    const { mcp, close } = await connect({ store, fetch: proofApi.fetch });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name)).not.toContain('prove_data_point');
    await close();
  });
});

describe('expired and revoked access', () => {
  const REVOKED = 'Access revoked or expired. Run pn-mcp login.';

  it('refreshes once on 401 and retries with the new token', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch((url, init) => {
      if (url.pathname === '/oauth/refresh') {
        expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: SECRETS.refreshToken, client_id: 'pn-agent-mcp' });
        return json(200, {
          access_token: SECRETS.newAccessToken,
          refresh_token: SECRETS.newRefreshToken,
          expires_in: 3600,
          scope: ALL_SCOPES.join(' '),
        });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === `Bearer ${SECRETS.newAccessToken}` ? json(200, { files: [] }) : json(401, { error: 'unauthorized' });
    });
    const { mcp, logs, close } = await connect({ store, fetch: api.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(api.calls.map((c) => c.url.pathname)).toEqual([
      '/api/agent/files/search',
      '/oauth/refresh',
      '/api/agent/files/search',
    ]);
    expect(await store.load()).toMatchObject({
      accessToken: SECRETS.newAccessToken,
      refreshToken: SECRETS.newRefreshToken,
      expiresAt: NOW + 3_600_000,
    });
    assertNoSecrets(res, logs);
    await close();
  });

  it('refreshes before calling when the stored token has expired', async () => {
    const store = new MemoryTokenStore(tokens({ expiresAt: NOW - 1 }));
    const api = fakeFetch((url) =>
      url.pathname === '/oauth/refresh'
        ? json(200, { access_token: SECRETS.newAccessToken, refresh_token: SECRETS.newRefreshToken, expires_in: 3600, scope: ALL_SCOPES.join(' ') })
        : json(200, { files: [] })
    );
    const { mcp, close } = await connect({ store, fetch: api.fetch });
    await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(api.calls.map((c) => c.url.pathname)).toEqual(['/oauth/refresh', '/api/agent/files/search']);
    await close();
  });

  it('clears the Keychain and says so when the refresh grant is invalid', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch((url) =>
      url.pathname === '/oauth/refresh' ? json(400, { error: 'invalid_grant' }) : json(401, { error: 'unauthorized' })
    );
    const { mcp, logs, close } = await connect({ store, fetch: api.fetch });
    const res = await mcp.callTool({ name: 'read_file', arguments: { fileId: 'file-1' } });
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: 'text', text: REVOKED }]);
    expect(await store.load()).toBeNull();
    assertNoSecrets(res, logs);
    await close();
  });

  it('clears the Keychain when the owner revoked the delegation', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch(() => json(403, { error: 'delegation_revoked' }));
    const { mcp, close } = await connect({ store, fetch: api.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(res.content).toEqual([{ type: 'text', text: REVOKED }]);
    expect(await store.load()).toBeNull();

    const next = await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(next.content).toEqual([{ type: 'text', text: 'Not signed in. Run pn-mcp login.' }]);
    expect(api.calls).toHaveLength(1);
    await close();
  });

  it('treats a 401 after a successful refresh as revoked', async () => {
    const store = new MemoryTokenStore(tokens());
    const api = fakeFetch((url) =>
      url.pathname === '/oauth/refresh'
        ? json(200, { access_token: SECRETS.newAccessToken, refresh_token: SECRETS.newRefreshToken, expires_in: 3600, scope: ALL_SCOPES.join(' ') })
        : json(401, { error: 'unauthorized' })
    );
    const { mcp, close } = await connect({ store, fetch: api.fetch });
    const res = await mcp.callTool({ name: 'search_my_files', arguments: {} });
    expect(res.content).toEqual([{ type: 'text', text: REVOKED }]);
    expect(await store.load()).toBeNull();
    expect(api.calls.filter((c) => c.url.pathname === '/oauth/refresh')).toHaveLength(1);
    await close();
  });
});
