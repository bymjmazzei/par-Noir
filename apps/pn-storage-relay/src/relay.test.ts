import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ListedFile, RelayBackend } from './backend.js';
import { BackendLoginError } from './backend.js';
import type { RelayConfig } from './config.js';
import { createRelayHandler } from './relay.js';

const TOKEN = 't'.repeat(40);
const APP = 'https://app.parnoir.com';

/** In-memory server filesystem keyed by absolute path. */
function memoryBackend(): RelayBackend & { files: Map<string, Buffer>; failLogin: boolean } {
  const files = new Map<string, Buffer>();
  const backend = {
    kind: 'sftp' as const,
    files,
    failLogin: false,
    guard() {
      if (backend.failLogin) throw new BackendLoginError('login failed');
    },
    async read(path: string) {
      backend.guard();
      return files.get(path) ?? null;
    },
    async stat(path: string) {
      backend.guard();
      const f = files.get(path);
      return f ? { size: f.length } : null;
    },
    async write(path: string, data: Buffer) {
      backend.guard();
      files.set(path, data);
    },
    async list(dir: string): Promise<ListedFile[]> {
      backend.guard();
      return [...files.entries()]
        .filter(([p]) => p.startsWith(`${dir}/`))
        .map(([p, d]) => ({ path: p.slice(dir.length + 1), size: d.length }));
    },
    async remove(path: string) {
      backend.guard();
      files.delete(path);
    },
    async close() {},
  };
  return backend;
}

const config: RelayConfig = {
  port: 0,
  token: TOKEN,
  prefix: 'par-noir-pn-abc',
  allowedOrigins: [APP],
  maxUploadBytes: 1024,
  backend: { protocol: 'sftp', host: 'h', port: 22, user: 'u', password: 'p', implicitTls: false, root: '/srv' },
};

let server: Server;
let base: string;
let backend: ReturnType<typeof memoryBackend>;

beforeEach(async () => {
  backend = memoryBackend();
  server = createServer(createRelayHandler(config, backend));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const auth = { Authorization: `Bearer ${TOKEN}` };
const blob = (key: string) => `${base}/v1/blob?key=${encodeURIComponent(key)}`;

describe('token auth', () => {
  it('refuses a missing or wrong token', async () => {
    expect((await fetch(`${base}/v1/health`)).status).toBe(401);
    const wrong = await fetch(`${base}/v1/health`, { headers: { Authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('reports health with the right token', async () => {
    const res = await fetch(`${base}/v1/health`, { headers: auth });
    expect(await res.json()).toEqual({ ok: true, protocol: 1, backend: 'sftp', prefix: 'par-noir-pn-abc' });
  });

  it('answers the platform health probe without a token or details', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(204);
  });
});

describe('CORS', () => {
  it('answers a preflight from an allowed origin and exposes ETag', async () => {
    const res = await fetch(blob('a'), {
      method: 'OPTIONS',
      headers: { Origin: APP, 'Access-Control-Request-Method': 'PUT' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('access-control-allow-headers')).toContain('If-Match');
    expect(res.headers.get('access-control-expose-headers')).toContain('ETag');
  });

  it('refuses other origins without CORS headers, even with the token', async () => {
    const res = await fetch(`${base}/v1/health`, { headers: { ...auth, Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.json()).toMatchObject({ error: 'origin_not_allowed' });
  });
});

describe('prefix confinement', () => {
  it('stores keys under root + prefix', async () => {
    const res = await fetch(blob('_metadata/a.json'), { method: 'PUT', headers: auth, body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect([...backend.files.keys()]).toEqual(['/srv/par-noir-pn-abc/_metadata/a.json']);
  });

  it('refuses keys that would escape the prefix', async () => {
    for (const key of ['../other/x', '/etc/passwd', 'a/../../x', 'a\\..\\x', '']) {
      const res = await fetch(blob(key), { method: 'PUT', headers: auth, body: 'x' });
      expect(res.status).toBe(400);
    }
    const list = await fetch(`${base}/v1/list?prefix=${encodeURIComponent('../')}`, { headers: auth });
    expect(list.status).toBe(400);
    expect(backend.files.size).toBe(0);
  });

  it('lists keys relative to the prefix, filtered by the requested prefix', async () => {
    backend.files.set('/srv/par-noir-pn-abc/_metadata/a.db', Buffer.from('abc'));
    backend.files.set('/srv/par-noir-pn-abc/_metadata/b.json', Buffer.from('{}'));
    backend.files.set('/srv/par-noir-pn-abc/par-noir-messages/x.json', Buffer.from('{}'));
    backend.files.set('/srv/other/secret', Buffer.from('no'));
    const res = await fetch(`${base}/v1/list?prefix=${encodeURIComponent('_metadata/a')}`, { headers: auth });
    expect(await res.json()).toEqual({ entries: [{ key: '_metadata/a.db', size: 3 }] });
  });
});

describe('blobs', () => {
  it('reads back what it wrote with a matching ETag, and deletes', async () => {
    const put = await fetch(blob('f.txt'), { method: 'PUT', headers: auth, body: 'hello' });
    const etag = put.headers.get('etag');
    const get = await fetch(blob('f.txt'), { headers: auth });
    expect(await get.text()).toBe('hello');
    expect(get.headers.get('etag')).toBe(etag);
    const head = await fetch(blob('f.txt'), { method: 'HEAD', headers: auth });
    expect(head.headers.get('etag')).toBe(etag);
    expect((await fetch(blob('f.txt'), { method: 'DELETE', headers: auth })).status).toBe(204);
    expect((await fetch(blob('f.txt'), { headers: auth })).status).toBe(404);
  });

  it('refuses a write whose If-Match no longer matches', async () => {
    const first = await fetch(blob('t.db'), { method: 'PUT', headers: auth, body: 'v1' });
    const etag = first.headers.get('etag')!;
    await fetch(blob('t.db'), { method: 'PUT', headers: auth, body: 'v2' });
    const stale = await fetch(blob('t.db'), { method: 'PUT', headers: { ...auth, 'If-Match': etag }, body: 'v3' });
    expect(stale.status).toBe(412);
    expect(await (await fetch(blob('t.db'), { headers: auth })).text()).toBe('v2');
  });

  it('refuses uploads over the size limit', async () => {
    const res = await fetch(blob('big'), { method: 'PUT', headers: auth, body: 'x'.repeat(2048) });
    expect(res.status).toBe(413);
  });

  it('reports a failed server login by name', async () => {
    backend.failLogin = true;
    const res = await fetch(blob('a'), { method: 'PUT', headers: auth, body: 'x' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'backend_login_failed' });
  });
});
