import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_SOCKET_FILE, agentErrorLine, startAgentSocket } from './agentSocket';

const dirs: string[] = [];
const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  // Short path: Unix socket paths are capped near 104 bytes on macOS.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnu-'));
  dirs.push(dir);
  return dir;
}

async function listening(dir: string): Promise<string> {
  const p = path.join(dir, AGENT_SOCKET_FILE);
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(p) && (fs.statSync(p).mode & 0o777) === 0o600) return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('socket not ready');
}

function exchange(socketPath: string, payload: string, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let buf = '';
    const conn = net.createConnection(socketPath, () => conn.write(payload));
    conn.on('data', (d) => {
      buf += d.toString('utf8');
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        lines.push(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
      }
      if (lines.length >= count) {
        conn.end();
        resolve(lines);
      }
    });
    conn.on('close', () => resolve(lines));
    // The server may stop reading mid-write (oversized line); the answer still arrives.
    conn.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') reject(err);
    });
  });
}

describe('agent socket', () => {
  it('binds owner-only and answers each line in order', async () => {
    const dir = tmpDir();
    const server = startAgentSocket(dir, async (line) => `echo:${JSON.parse(line).id}`, () => undefined);
    closers.push(server.close);
    const p = await listening(dir);
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);

    const out = await exchange(p, '{"id":"a"}\n{"id":"b"}\n', 2);
    expect(out).toEqual(['echo:a', 'echo:b']);
  });

  it('replaces a stale socket and removes it on close', async () => {
    const dir = tmpDir();
    const first = startAgentSocket(dir, async () => 'x', () => undefined);
    const p = await listening(dir);
    const second = startAgentSocket(dir, async () => 'y', () => undefined);
    await listening(dir);
    expect(await exchange(p, '{}\n', 1)).toEqual(['y']);
    first.close();
    second.close();
    expect(fs.existsSync(p)).toBe(false);
  });

  it('turns handler failures into a fixed unavailable line with the request id', async () => {
    const dir = tmpDir();
    const server = startAgentSocket(
      dir,
      async () => {
        throw new Error('pn name and passcode in a stack trace');
      },
      () => undefined
    );
    closers.push(server.close);
    const p = await listening(dir);
    const [line] = await exchange(p, '{"v":1,"id":"req-9","token":"t"}\n', 1);
    expect(JSON.parse(line!)).toEqual({ v: 1, id: 'req-9', ok: false, error: 'unavailable' });
    expect(line).not.toMatch(/passcode|stack/);
  });

  it('refuses oversized lines', async () => {
    const dir = tmpDir();
    const server = startAgentSocket(dir, async () => 'ok', () => undefined);
    closers.push(server.close);
    const p = await listening(dir);
    const [line] = await exchange(p, 'x'.repeat(300 * 1024), 1);
    expect(JSON.parse(line!)).toEqual({ v: 1, id: '0', ok: false, error: 'invalid_request' });
  });

  it('only echoes safe request ids', () => {
    expect(agentErrorLine('{"id":"ok_1"}', 'unavailable')).toBe('{"v":1,"id":"ok_1","ok":false,"error":"unavailable"}');
    expect(JSON.parse(agentErrorLine('{"id":"<script>"}', 'invalid_request')).id).toBe('0');
    expect(JSON.parse(agentErrorLine('garbage', 'invalid_request')).id).toBe('0');
  });
});
