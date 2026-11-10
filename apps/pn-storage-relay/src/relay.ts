import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { posix } from 'node:path';
import {
  BackendLoginError,
  BackendPermissionError,
  BackendUnreachableError,
  type RelayBackend,
} from './backend.js';
import type { RelayConfig } from './config.js';
import {
  RELAY_ERROR_STATUS,
  RELAY_EXPOSED_HEADERS,
  RELAY_PATHS,
  RELAY_PROTOCOL_VERSION,
  isRelayKeySafe,
  type RelayErrorCode,
} from './protocol.js';

class RelayError extends Error {
  constructor(
    readonly code: RelayErrorCode,
    message: string
  ) {
    super(message);
  }
}

function sha256(data: string | Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

function etagOf(data: Buffer): string {
  return `"${sha256(data).toString('hex').slice(0, 32)}"`;
}

function sendError(res: ServerResponse, code: RelayErrorCode, message: string): void {
  res.statusCode = RELAY_ERROR_STATUS[code];
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: code, message }));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new RelayError('too_large', 'Upload is larger than MAX_UPLOAD_MB.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Serialises writes per key so the If-Match check and the write are one step. */
class KeyLocks {
  private readonly tails = new Map<string, Promise<unknown>>();

  async with<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const settled = next.catch(() => undefined);
    this.tails.set(key, settled);
    try {
      return await next;
    } finally {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    }
  }
}

export function createRelayHandler(cfg: RelayConfig, backend: RelayBackend) {
  const tokenHash = sha256(cfg.token);
  const root = posix.join(cfg.backend.root, cfg.prefix);
  const locks = new KeyLocks();
  /** ETag by path for an unchanged size + mtime, so HEAD does not download every time. */
  const etags = new Map<string, { size: number; mtime: number; etag: string }>();

  function pathFor(key: string): string {
    if (!isRelayKeySafe(key)) throw new RelayError('bad_key', 'Key must be relative and stay inside the prefix.');
    const full = posix.join(root, key);
    if (!full.startsWith(`${root}/`)) throw new RelayError('bad_key', 'Key must stay inside the prefix.');
    return full;
  }

  async function currentEtag(path: string): Promise<{ etag: string; size: number; modifiedAt?: Date } | null> {
    const stat = await backend.stat(path);
    if (!stat) return null;
    const mtime = stat.modifiedAt?.getTime() ?? -1;
    const cached = etags.get(path);
    if (cached && cached.size === stat.size && cached.mtime === mtime && mtime !== -1) {
      return { etag: cached.etag, size: stat.size, modifiedAt: stat.modifiedAt };
    }
    const data = await backend.read(path);
    if (!data) return null;
    const etag = etagOf(data);
    etags.set(path, { size: stat.size, mtime, etag });
    return { etag, size: data.length, modifiedAt: stat.modifiedAt };
  }

  function authorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) return false;
    return timingSafeEqual(sha256(match[1]!), tokenHash);
  }

  async function handleBlob(req: IncomingMessage, res: ServerResponse, key: string): Promise<void> {
    const path = pathFor(key);
    switch (req.method) {
      case 'GET': {
        const data = await backend.read(path);
        if (!data) throw new RelayError('not_found', 'No such file.');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(data.length));
        res.setHeader('ETag', etagOf(data));
        res.end(data);
        return;
      }
      case 'HEAD': {
        const head = await currentEtag(path);
        if (!head) throw new RelayError('not_found', 'No such file.');
        res.statusCode = 200;
        res.setHeader('Content-Length', String(head.size));
        res.setHeader('ETag', head.etag);
        if (head.modifiedAt) res.setHeader('Last-Modified', head.modifiedAt.toUTCString());
        res.end();
        return;
      }
      case 'PUT': {
        const data = await readBody(req, cfg.maxUploadBytes);
        const ifMatch = req.headers['if-match'];
        const etag = await locks.with(path, async () => {
          if (typeof ifMatch === 'string' && ifMatch) {
            const head = await currentEtag(path);
            if (!head || head.etag !== ifMatch) throw new RelayError('precondition_failed', 'Changed since read.');
          }
          await backend.write(path, data);
          const written = etagOf(data);
          const stat = await backend.stat(path).catch(() => null);
          if (stat?.modifiedAt) etags.set(path, { size: stat.size, mtime: stat.modifiedAt.getTime(), etag: written });
          else etags.delete(path);
          return written;
        });
        res.setHeader('ETag', etag);
        sendJson(res, 200, { etag });
        return;
      }
      case 'DELETE': {
        await locks.with(path, () => backend.remove(path));
        etags.delete(path);
        res.statusCode = 204;
        res.end();
        return;
      }
      default:
        res.statusCode = 405;
        res.end();
    }
  }

  async function handleList(res: ServerResponse, prefix: string): Promise<void> {
    if (prefix && !isRelayKeySafe(prefix.endsWith('/') ? prefix : `${prefix}x`)) {
      throw new RelayError('bad_key', 'Prefix must be relative and stay inside the relay prefix.');
    }
    const dirKey = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
    const dir = dirKey ? pathFor(dirKey) : root;
    const files = await backend.list(dir);
    const entries = files
      .map((f) => ({
        key: dirKey ? `${dirKey}/${f.path}` : f.path,
        size: f.size,
        ...(f.modifiedAt ? { lastModified: f.modifiedAt.toISOString() } : {}),
      }))
      .filter((e) => e.key.startsWith(prefix));
    sendJson(res, 200, { entries });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://relay');

      if (url.pathname === '/healthz' && req.method === 'GET') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const origin = req.headers.origin;
      if (origin) {
        if (!cfg.allowedOrigins.includes(origin)) {
          throw new RelayError('origin_not_allowed', `Origin ${origin} is not in ALLOWED_ORIGINS.`);
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Expose-Headers', RELAY_EXPOSED_HEADERS.join(', '));
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
        res.setHeader('Access-Control-Max-Age', '600');
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!authorized(req)) throw new RelayError('unauthorized', 'Missing or wrong relay token.');

      if (url.pathname === RELAY_PATHS.health && req.method === 'GET') {
        sendJson(res, 200, { ok: true, protocol: RELAY_PROTOCOL_VERSION, backend: backend.kind, prefix: cfg.prefix });
        return;
      }
      if (url.pathname === RELAY_PATHS.blob) {
        await handleBlob(req, res, url.searchParams.get('key') ?? '');
        return;
      }
      if (url.pathname === RELAY_PATHS.list && req.method === 'GET') {
        await handleList(res, url.searchParams.get('prefix') ?? '');
        return;
      }
      sendError(res, 'not_found', 'Unknown route.');
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err instanceof RelayError) return sendError(res, err.code, err.message);
      if (err instanceof BackendLoginError) return sendError(res, 'backend_login_failed', err.message);
      if (err instanceof BackendPermissionError) return sendError(res, 'backend_permission_denied', err.message);
      if (err instanceof BackendUnreachableError) return sendError(res, 'backend_unreachable', err.message);
      console.error('[relay]', err);
      sendError(res, 'backend_error', 'The storage server returned an error.');
    }
  };
}
