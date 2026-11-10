import { posix } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { Client, FTPError } from 'basic-ftp';
import type { BackendConfig } from '../config.js';
import {
  BackendLoginError,
  BackendPermissionError,
  BackendUnreachableError,
  isUnreachable,
  SerialConnection,
  type FileStat,
  type ListedFile,
  type RelayBackend,
} from '../backend.js';

const NOT_FOUND = 550;
const PERMISSION_CODES = new Set([550, 553, 532]);
const LOGIN_FAILED = 530;

function ftpCode(err: unknown): number | undefined {
  return err instanceof FTPError ? err.code : undefined;
}

function translate(err: unknown, writing: boolean): never {
  const code = ftpCode(err);
  if (code === LOGIN_FAILED) throw new BackendLoginError('The FTPS server rejected the username or password.');
  if (writing && code !== undefined && PERMISSION_CODES.has(code)) {
    throw new BackendPermissionError(`The FTPS server refused the write (${code}).`);
  }
  if (isUnreachable(err)) throw new BackendUnreachableError(`Could not reach the FTPS server: ${(err as Error).message}`);
  throw err;
}

export function createFtpsBackend(cfg: BackendConfig): RelayBackend {
  const conn = new SerialConnection<Client>(
    async () => {
      const client = new Client(30_000);
      try {
        await client.access({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          password: cfg.password,
          secure: cfg.implicitTls ? 'implicit' : true,
        });
      } catch (err) {
        client.close();
        translate(err, false);
      }
      return client;
    },
    async (client) => client.close(),
    (err) => isUnreachable(err) || (err instanceof Error && /closed|ECONNRESET|socket/i.test(err.message))
  );

  async function listInto(client: Client, dir: string, rel: string, out: ListedFile[]): Promise<void> {
    let entries;
    try {
      entries = await client.list(posix.join(dir, rel));
    } catch (err) {
      if (ftpCode(err) === NOT_FOUND) return;
      throw err;
    }
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue;
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) await listInto(client, dir, path, out);
      else if (e.isFile) out.push({ path, size: e.size, modifiedAt: e.modifiedAt });
    }
  }

  return {
    kind: 'ftps',
    read: (path) =>
      conn
        .run(async (client) => {
          const chunks: Buffer[] = [];
          const sink = new PassThrough();
          sink.on('data', (c: Buffer) => chunks.push(c));
          try {
            await client.downloadTo(sink, path);
          } catch (err) {
            if (ftpCode(err) === NOT_FOUND) return null;
            throw err;
          }
          return Buffer.concat(chunks);
        })
        .catch((err) => translate(err, false)),
    stat: (path) =>
      conn
        .run(async (client): Promise<FileStat | null> => {
          let size: number;
          try {
            size = await client.size(path);
          } catch (err) {
            if (ftpCode(err) === NOT_FOUND) return null;
            throw err;
          }
          const modifiedAt = await client.lastMod(path).catch(() => undefined);
          return { size, modifiedAt };
        })
        .catch((err) => translate(err, false)),
    write: (path, data) =>
      conn
        .run(async (client) => {
          await client.ensureDir(posix.dirname(path));
          await client.uploadFrom(Readable.from(data), path);
        })
        .catch((err) => translate(err, true)),
    list: (dir) =>
      conn
        .run(async (client) => {
          const out: ListedFile[] = [];
          await listInto(client, dir, '', out);
          return out;
        })
        .catch((err) => translate(err, false)),
    remove: (path) =>
      conn
        .run(async (client) => {
          try {
            await client.remove(path);
          } catch (err) {
            if (ftpCode(err) === NOT_FOUND) return;
            throw err;
          }
        })
        .catch((err) => translate(err, true)),
    close: () => conn.reset(),
  };
}
