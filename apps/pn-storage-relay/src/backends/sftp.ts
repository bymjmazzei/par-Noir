import { posix } from 'node:path';
import SftpClient from 'ssh2-sftp-client';
import type { BackendConfig } from '../config.js';
import {
  BackendLoginError,
  BackendPermissionError,
  BackendUnreachableError,
  isUnreachable,
  SerialConnection,
  type ListedFile,
  type RelayBackend,
} from '../backend.js';

/** SFTP status codes surface as `code` on ssh2 errors. */
const SFTP_NO_SUCH_FILE = 2;
const SFTP_PERMISSION_DENIED = 3;

function sftpCode(err: unknown): unknown {
  return (err as { code?: unknown })?.code;
}

function isMissing(err: unknown): boolean {
  const code = sftpCode(err);
  return code === SFTP_NO_SUCH_FILE || code === 'ENOENT' || /no such file/i.test(String((err as Error)?.message));
}

function translate(err: unknown, writing: boolean): never {
  const message = String((err as Error)?.message ?? err);
  if (/authentication methods failed|auth.*fail/i.test(message)) {
    throw new BackendLoginError('The SFTP server rejected the username, password or key.');
  }
  if (writing && (sftpCode(err) === SFTP_PERMISSION_DENIED || /permission denied/i.test(message))) {
    throw new BackendPermissionError('The SFTP server refused the write (permission denied).');
  }
  if (isUnreachable(err)) throw new BackendUnreachableError(`Could not reach the SFTP server: ${message}`);
  throw err;
}

export function createSftpBackend(cfg: BackendConfig): RelayBackend {
  const conn = new SerialConnection<SftpClient>(
    async () => {
      const client = new SftpClient();
      try {
        await client.connect({
          host: cfg.host,
          port: cfg.port,
          username: cfg.user,
          password: cfg.password,
          privateKey: cfg.privateKey,
          readyTimeout: 30_000,
        });
      } catch (err) {
        await client.end().catch(() => undefined);
        translate(err, false);
      }
      return client;
    },
    async (client) => {
      await client.end();
    },
    (err) => isUnreachable(err) || /not connected|no sftp connection|closed/i.test(String((err as Error)?.message))
  );

  async function listInto(client: SftpClient, dir: string, rel: string, out: ListedFile[]): Promise<void> {
    let entries;
    try {
      entries = await client.list(posix.join(dir, rel));
    } catch (err) {
      if (isMissing(err)) return;
      throw err;
    }
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.type === 'd') await listInto(client, dir, path, out);
      else if (e.type === '-') out.push({ path, size: e.size, modifiedAt: new Date(e.modifyTime) });
    }
  }

  return {
    kind: 'sftp',
    read: (path) =>
      conn
        .run(async (client) => {
          try {
            return (await client.get(path)) as Buffer;
          } catch (err) {
            if (isMissing(err)) return null;
            throw err;
          }
        })
        .catch((err) => translate(err, false)),
    stat: (path) =>
      conn
        .run(async (client) => {
          try {
            const s = await client.stat(path);
            return { size: s.size, modifiedAt: new Date(s.modifyTime) };
          } catch (err) {
            if (isMissing(err)) return null;
            throw err;
          }
        })
        .catch((err) => translate(err, false)),
    write: (path, data) =>
      conn
        .run(async (client) => {
          await client.mkdir(posix.dirname(path), true);
          await client.put(data, path);
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
          await client.delete(path, true);
        })
        .catch((err) => translate(err, true)),
    close: () => conn.reset(),
  };
}
