import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PRIVATE_TEXT_MAX_CHARS } from '@par-noir/standard-data-points';
import { defaultAgentSocketPath } from '../custodyClient';
import { ERROR_MESSAGES } from '../errors';
import { MemoryTokenStore } from '../tokenStore';
import { API, LEAKY, NOW, SECRETS, assertNoSecrets, connect, fakeFetch, json, tokens } from './helpers';

const PRIVATE_SCOPES = ['openid', 'ai:files.published', 'ai:files.private', 'ai:pen.private'];
const PRIVATE_TOOLS = ['read_private_file', 'read_private_pen_document', 'search_private_files'];

type Reply = (req: Record<string, unknown>) => unknown;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

/** A stand-in for par Noir Unlock's agent.sock that answers each line with `reply`. */
async function fakeUnlock(reply: Reply) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnm-'));
  const socketPath = path.join(dir, 'agent.sock');
  const received: Array<Record<string, unknown>> = [];
  const server = net.createServer((conn) => {
    let buf = '';
    conn.setEncoding('utf8');
    conn.on('data', (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      const req = JSON.parse(buf.slice(0, nl)) as Record<string, unknown>;
      received.push(req);
      const out = reply(req);
      if (out === null) conn.destroy();
      else conn.write(`${typeof out === 'string' ? out : JSON.stringify(out)}\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const stop = () => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  cleanups.push(stop);
  return { socketPath, received, stop };
}

const ok = (req: Record<string, unknown>, result: unknown) => ({ v: 1, id: req.id, ok: true, result });
const err = (req: Record<string, unknown>, error: string) => ({ v: 1, id: req.id, ok: false, error });

const api = fakeFetch(() => json(404, { error: 'not_found' }));

async function listNames(opts: { scopes: string[]; unlockSocket?: string }) {
  const store = new MemoryTokenStore(tokens({ scopes: opts.scopes }));
  const { mcp, close } = await connect({ store, fetch: api.fetch, unlockSocket: opts.unlockSocket });
  const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
  await close();
  return names;
}

describe('private tool listing', () => {
  it('lists the private tools only in local mode, with the scope, when Unlock is running', async () => {
    const unlock = await fakeUnlock((req) => ok(req, {}));
    const withAll = await listNames({ scopes: PRIVATE_SCOPES, unlockSocket: unlock.socketPath });
    expect(withAll).toEqual(expect.arrayContaining(PRIVATE_TOOLS));

    // No custody client at all (remote-style deps): never listed.
    const remote = await listNames({ scopes: PRIVATE_SCOPES });
    expect(remote.filter((n) => n.includes('private'))).toEqual([]);

    // Local mode but Unlock is not running: no socket, no private tools.
    const noSocket = await listNames({ scopes: PRIVATE_SCOPES, unlockSocket: path.join(os.tmpdir(), 'pnm-missing.sock') });
    expect(noSocket.filter((n) => n.includes('private'))).toEqual([]);

    // Socket present but the token has no private scope.
    const unscoped = await listNames({ scopes: ['openid', 'ai:files.published'], unlockSocket: unlock.socketPath });
    expect(unscoped.filter((n) => n.includes('private'))).toEqual([]);

    // Pen only: search and Pen reads, never private file reads.
    const penOnly = await listNames({ scopes: ['openid', 'ai:pen.private'], unlockSocket: unlock.socketPath });
    expect(penOnly.filter((n) => n.includes('private'))).toEqual(['read_private_pen_document', 'search_private_files']);
  });

  it('points at Unlock’s userData socket', () => {
    expect(defaultAgentSocketPath('/Users/me')).toBe('/Users/me/Library/Application Support/par Noir Unlock/agent.sock');
  });
});

describe('socket client', () => {
  async function call(reply: Reply, name: string, args: Record<string, unknown>, after?: (u: { stop: () => void }) => void) {
    const unlock = await fakeUnlock(reply);
    const store = new MemoryTokenStore(tokens({ scopes: PRIVATE_SCOPES }));
    const { mcp, logs, close } = await connect({ store, fetch: api.fetch, unlockSocket: unlock.socketPath });
    after?.(unlock);
    const res = await mcp.callTool({ name, arguments: args });
    await close();
    return { res, logs, received: unlock.received };
  }

  const message = (res: { content?: unknown }) => (res.content as Array<{ text: string }>)[0]?.text;

  it('sends the agent token, tool and args, one request per line', async () => {
    const { received } = await call((req) => ok(req, { files: [], penDocuments: [] }), 'search_private_files', {
      query: 'tax',
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ v: 1, token: SECRETS.accessToken, tool: 'search_private_files', args: { query: 'tax' } });
  });

  it('maps every Unlock refusal to a fixed message', async () => {
    const cases: Array<[string, string]> = [
      ['owner_declined', ERROR_MESSAGES.owner_declined],
      ['agent_not_on_this_mac', ERROR_MESSAGES.agent_not_on_this_mac],
      ['not_found', ERROR_MESSAGES.private_not_found],
      ['unsupported_type', ERROR_MESSAGES.unsupported_type],
      ['too_large', ERROR_MESSAGES.file_too_large],
      ['insufficient_scope', ERROR_MESSAGES.insufficient_scope],
      ['access_revoked', ERROR_MESSAGES.access_revoked],
      ['unavailable', ERROR_MESSAGES.unavailable],
    ];
    for (const [code, text] of cases) {
      const { res } = await call((req) => err(req, code), 'read_private_file', { fileId: 'f1' });
      expect(res.isError).toBe(true);
      expect(message(res)).toBe(text);
    }
  });

  it('reports unlock_not_running when Unlock quit after listing, or hung up without answering', async () => {
    const quit = await call((req) => ok(req, {}), 'read_private_file', { fileId: 'f1' }, (u) => u.stop());
    expect(message(quit.res)).toBe(ERROR_MESSAGES.unlock_not_running);
    const hungUp = await call(() => null, 'read_private_file', { fileId: 'f1' });
    expect(message(hungUp.res)).toBe(ERROR_MESSAGES.unlock_not_running);
  });

  it('refuses replies for another request, unknown codes and garbage', async () => {
    const replies: Reply[] = [
      () => ({ v: 1, id: 'someone-else', ok: true, result: {} }),
      (req) => err(req, `stack trace for ${SECRETS.passcode}`),
      () => 'not json',
      (req) => ok(req, { fileId: 'f1' }),
    ];
    for (const reply of replies) {
      const { res, logs } = await call(reply, 'read_private_file', { fileId: 'f1' });
      expect(message(res)).toBe(ERROR_MESSAGES.unavailable);
      assertNoSecrets(res, logs);
    }
  });

  it('refreshes an expired token before asking Unlock', async () => {
    const unlock = await fakeUnlock((req) => ok(req, { files: [], penDocuments: [] }));
    const refresh = fakeFetch((url) =>
      url.pathname === '/oauth/refresh'
        ? json(200, { access_token: SECRETS.newAccessToken, refresh_token: SECRETS.newRefreshToken, expires_in: 3600 })
        : json(404, {})
    );
    const store = new MemoryTokenStore(tokens({ scopes: PRIVATE_SCOPES, expiresAt: NOW - 1 }));
    const { mcp, close } = await connect({ store, fetch: refresh.fetch, unlockSocket: unlock.socketPath });
    const res = await mcp.callTool({ name: 'search_private_files', arguments: {} });
    await close();
    expect(res.isError).toBeFalsy();
    expect(unlock.received[0]?.token).toBe(SECRETS.newAccessToken);
    expect(refresh.calls[0]?.url.toString()).toBe(`${API}/oauth/refresh`);
  });
});

describe('private output is an allowlist', () => {
  it('passes through only named fields and never a secret, token or identity value', async () => {
    const unlock = await fakeUnlock((req) => {
      if (req.tool === 'search_private_files') {
        return ok(req, {
          files: [{ fileId: 'f1', name: 'notes.txt', mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00Z', ...LEAKY }],
          penDocuments: [{ docId: 'd1', title: 'Plan', updatedAt: null, ...LEAKY }],
          ...LEAKY,
        });
      }
      if (req.tool === 'read_private_file') {
        return ok(req, { fileId: 'f1', name: 'notes.txt', mimeType: 'text/plain', text: 'x'.repeat(PRIVATE_TEXT_MAX_CHARS + 10), ...LEAKY });
      }
      return ok(req, { docId: 'd1', title: 'Plan', updatedAt: '2026-10-02T00:00:00Z', text: 'Pen body', ...LEAKY });
    });
    const store = new MemoryTokenStore(tokens({ scopes: PRIVATE_SCOPES }));
    const { mcp, logs, close } = await connect({ store, fetch: api.fetch, unlockSocket: unlock.socketPath });

    const search = await mcp.callTool({ name: 'search_private_files', arguments: { query: '' } });
    const file = await mcp.callTool({ name: 'read_private_file', arguments: { fileId: 'f1' } });
    const doc = await mcp.callTool({ name: 'read_private_pen_document', arguments: { docId: 'd1' } });
    await close();

    expect(search.structuredContent).toEqual({
      files: [{ fileId: 'f1', name: 'notes.txt', mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00.000Z' }],
      penDocuments: [{ docId: 'd1', title: 'Plan', updatedAt: null }],
    });
    const f = (file.structuredContent as { file: Record<string, unknown> }).file;
    expect(Object.keys(f).sort()).toEqual(['fileId', 'mimeType', 'name', 'text', 'truncated']);
    expect(f.truncated).toBe(true);
    expect((f.text as string).length).toBe(PRIVATE_TEXT_MAX_CHARS);
    expect(doc.structuredContent).toEqual({
      document: { docId: 'd1', title: 'Plan', updatedAt: '2026-10-02T00:00:00.000Z', text: 'Pen body', truncated: false },
    });
    assertNoSecrets(search, file, doc, logs);
  });
});
