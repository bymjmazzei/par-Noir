import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  AGENT_CUSTODY_APP_DIR,
  AGENT_CUSTODY_MAX_LINE_BYTES,
  AGENT_CUSTODY_PROTOCOL_VERSION,
  AGENT_CUSTODY_SOCKET_FILE,
  parseAgentCustodyResponse,
  type AgentCustodyErrorCode,
  type AgentCustodyTool,
} from '@par-noir/standard-data-points';
import { McpToolError, type McpErrorCode } from './errors';

/** Longer than Unlock's own two-minute wait, which covers the owner's Touch ID prompt. */
const CALL_TIMEOUT_MS = 150_000;

const CODE_MAP: Record<AgentCustodyErrorCode, McpErrorCode> = {
  invalid_request: 'invalid_request',
  access_revoked: 'access_revoked',
  insufficient_scope: 'insufficient_scope',
  agent_not_on_this_mac: 'agent_not_on_this_mac',
  owner_declined: 'owner_declined',
  not_found: 'private_not_found',
  unsupported_type: 'unsupported_type',
  too_large: 'file_too_large',
  unavailable: 'unavailable',
};

export function defaultAgentSocketPath(home: string = os.homedir()): string {
  return path.join(home, 'Library', 'Application Support', AGENT_CUSTODY_APP_DIR, AGENT_CUSTODY_SOCKET_FILE);
}

export interface AgentCustodyClientOptions {
  socketPath: string;
  /** The agent's current access token; Unlock re-verifies it on every request. */
  accessToken: () => Promise<string>;
  timeoutMs?: number;
}

/** Talks to par Noir Unlock on this Mac over its owner-only socket. Never logs what it sends. */
export class AgentCustodyClient {
  private readonly socketPath: string;
  private readonly accessToken: () => Promise<string>;
  private readonly timeoutMs: number;

  constructor(opts: AgentCustodyClientOptions) {
    this.socketPath = opts.socketPath;
    this.accessToken = opts.accessToken;
    this.timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
  }

  /** Unlock is running and serving agents on this Mac. */
  available(): boolean {
    try {
      return fs.statSync(this.socketPath).isSocket();
    } catch {
      return false;
    }
  }

  async call(tool: AgentCustodyTool, args: Record<string, unknown>): Promise<unknown> {
    if (!this.available()) throw new McpToolError('unlock_not_running');
    const id = randomUUID();
    const token = await this.accessToken();
    const line = JSON.stringify({ v: AGENT_CUSTODY_PROTOCOL_VERSION, id, token, tool, args });
    const reply = await this.exchange(line);

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(reply);
    } catch {
      parsed = null;
    }
    const res = parseAgentCustodyResponse(parsed);
    if (!res || res.id !== id) throw new McpToolError('unavailable');
    if (!res.ok) throw new McpToolError(CODE_MAP[res.error]);
    return res.result;
  }

  private exchange(line: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffered = '';
      let done = false;
      const finish = (err: McpToolError | null, out = '') => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        conn.destroy();
        if (err) reject(err);
        else resolve(out);
      };
      const timer = setTimeout(() => finish(new McpToolError('unavailable')), this.timeoutMs);
      const conn = net.createConnection(this.socketPath, () => conn.write(`${line}\n`));
      conn.setEncoding('utf8');
      conn.on('data', (chunk: string) => {
        buffered += chunk;
        const nl = buffered.indexOf('\n');
        if (nl !== -1) finish(null, buffered.slice(0, nl));
        else if (Buffer.byteLength(buffered) > AGENT_CUSTODY_MAX_LINE_BYTES) finish(new McpToolError('unavailable'));
      });
      conn.on('error', (err: NodeJS.ErrnoException) => {
        const gone = err.code === 'ENOENT' || err.code === 'ECONNREFUSED';
        finish(new McpToolError(gone ? 'unlock_not_running' : 'unavailable'));
      });
      conn.on('close', () => finish(new McpToolError('unlock_not_running')));
    });
  }
}
