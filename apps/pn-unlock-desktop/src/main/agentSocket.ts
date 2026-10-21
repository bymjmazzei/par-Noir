/**
 * Local socket the par Noir MCP server talks to: owner-only (0600), one JSON request per line,
 * one JSON response per line. Main only frames lines; every check and read runs in the
 * renderer's custody bridge. Main is packaged without node_modules, so the protocol limits
 * below mirror @par-noir/standard-data-points (agentCustody.ts) instead of importing it.
 */

import fs from 'fs';
import net from 'net';
import path from 'path';

export const AGENT_SOCKET_FILE = 'agent.sock';
const MAX_LINE_BYTES = 256 * 1024;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type AgentLineHandler = (line: string) => Promise<string>;

/** Fixed-code failure for a line main could not hand off; echoes the request id when it is safe. */
export function agentErrorLine(line: string, error: 'invalid_request' | 'unavailable'): string {
  let id = '0';
  try {
    const parsed = JSON.parse(line) as { id?: unknown };
    if (typeof parsed?.id === 'string' && REQUEST_ID_RE.test(parsed.id)) id = parsed.id;
  } catch {
    /* keep the placeholder id */
  }
  return JSON.stringify({ v: 1, id, ok: false, error });
}

function removeStaleSocket(socketPath: string): void {
  try {
    if (fs.lstatSync(socketPath).isSocket()) fs.unlinkSync(socketPath);
  } catch {
    /* nothing there */
  }
}

function serveConnection(conn: net.Socket, handle: AgentLineHandler): void {
  let buffered = Buffer.alloc(0);
  let chain = Promise.resolve();
  conn.setTimeout(IDLE_TIMEOUT_MS, () => conn.destroy());

  const reply = (out: string) => {
    if (!conn.destroyed) conn.write(`${out}\n`);
  };

  let refused = false;
  conn.on('data', (chunk: Buffer) => {
    if (refused) return;
    buffered = Buffer.concat([buffered, chunk]);
    let nl = buffered.indexOf(0x0a);
    while (nl !== -1) {
      const line = buffered.subarray(0, nl).toString('utf8').trim();
      buffered = buffered.subarray(nl + 1);
      if (line) {
        if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
          chain = chain.then(() => reply(agentErrorLine('', 'invalid_request')));
        } else {
          chain = chain.then(async () => reply(await handle(line).catch(() => agentErrorLine(line, 'unavailable'))));
        }
      }
      nl = buffered.indexOf(0x0a);
    }
    if (buffered.length > MAX_LINE_BYTES) {
      refused = true;
      buffered = Buffer.alloc(0);
      void chain.then(() => conn.end(`${agentErrorLine('', 'invalid_request')}\n`));
    }
  });
  conn.on('error', () => conn.destroy());
}

export function startAgentSocket(
  userDataDir: string,
  handle: AgentLineHandler,
  onError: (reason: string) => void
): { close: () => void } {
  const socketPath = path.join(userDataDir, AGENT_SOCKET_FILE);
  fs.mkdirSync(userDataDir, { recursive: true });
  removeStaleSocket(socketPath);

  const server = net.createServer((conn) => serveConnection(conn, handle));
  server.on('error', () => onError('agent_socket_unavailable'));
  // Bind with an owner-only umask so the socket is never reachable by other users, even briefly.
  const previousUmask = process.umask(0o177);
  try {
    server.listen(socketPath, () => {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch {
        server.close();
        removeStaleSocket(socketPath);
        onError('agent_socket_chmod_failed');
      }
    });
  } finally {
    process.umask(previousUmask);
  }

  return {
    close: () => {
      server.close();
      removeStaleSocket(socketPath);
    },
  };
}
