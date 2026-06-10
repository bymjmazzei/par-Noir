import { Client } from 'basic-ftp';
import type { BlobStore } from '@par-noir/user-owned-storage';
import type { BlobEntry, BlobHead, PutOptions, PutResult } from '@par-noir/user-owned-storage';
import { Writable } from 'stream';

interface FtpMeta {
  version: string;
  size: number;
  lastModified: string;
}

export class FtpBlobAdapter implements BlobStore {
  readonly providerId = 'ftp';
  private config: {
    host: string;
    port: number;
    username: string;
    password: string;
    basePath: string;
    useTls: boolean;
    passiveMode: boolean;
  };
  private keyPrefix: string;

  constructor(
    config: {
      host: string;
      port: number;
      username: string;
      password: string;
      basePath: string;
      useTls: boolean;
      passiveMode: boolean;
    },
    keyPrefix = ''
  ) {
    this.config = config;
    this.keyPrefix = keyPrefix.endsWith('/') ? keyPrefix : keyPrefix ? `${keyPrefix}/` : '';
  }

  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client();
    client.ftp.verbose = false;
    try {
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: this.config.password,
        secure: this.config.useTls,
        secureOptions: { rejectUnauthorized: true }
      });
      // basic-ftp uses passive mode by default; active mode not supported in v1
      const base = this.config.basePath.replace(/\/$/, '');
      if (base) await client.ensureDir(base);
      return await fn(client);
    } finally {
      client.close();
    }
  }

  private fullPath(key: string): string {
    const k = key.startsWith('/') ? key.slice(1) : key;
    const base = this.config.basePath.replace(/\/$/, '');
    const rel = `${this.keyPrefix}${k}`;
    return base ? `${base}/${rel}` : rel;
  }

  private metaPath(key: string): string {
    return `${this.fullPath(key)}.meta.json`;
  }

  private async readMeta(client: Client, key: string): Promise<FtpMeta | null> {
    const chunks: Buffer[] = [];
    try {
      await client.downloadTo(
        new Writable({
          write(chunk, _enc, cb) {
            chunks.push(Buffer.from(chunk));
            cb();
          }
        }),
        this.metaPath(key)
      );
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as FtpMeta;
    } catch {
      return null;
    }
  }

  private async writeMeta(client: Client, key: string, meta: FtpMeta): Promise<void> {
    const { Readable } = await import('stream');
    const body = Readable.from([JSON.stringify(meta)]);
    await client.uploadFrom(body, this.metaPath(key));
  }

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    return this.withClient(async (client) => {
      const existing = await this.readMeta(client, key);
      if (options?.ifMatch && existing && existing.version !== options.ifMatch) {
        throw new Error('FTP version mismatch');
      }
      const dir = this.fullPath(key).split('/').slice(0, -1).join('/');
      if (dir) await client.ensureDir(dir);
      const { Readable } = await import('stream');
      await client.uploadFrom(Readable.from([Buffer.from(data)]), this.fullPath(key));
      const version = `${Date.now()}`;
      const meta: FtpMeta = {
        version,
        size: data.length,
        lastModified: new Date().toISOString()
      };
      await this.writeMeta(client, key, meta);
      return { etag: version, version };
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.withClient(async (client) => {
      const chunks: Buffer[] = [];
      try {
        await client.downloadTo(
          new Writable({
            write(chunk, _enc, cb) {
              chunks.push(Buffer.from(chunk));
              cb();
            }
          }),
          this.fullPath(key)
        );
        return new Uint8Array(Buffer.concat(chunks));
      } catch {
        return null;
      }
    });
  }

  async head(key: string): Promise<BlobHead | null> {
    return this.withClient(async (client) => {
      const meta = await this.readMeta(client, key);
      if (!meta) return null;
      return {
        etag: meta.version,
        version: meta.version,
        size: meta.size,
        lastModified: meta.lastModified
      };
    });
  }

  async delete(key: string): Promise<void> {
    return this.withClient(async (client) => {
      try {
        await client.remove(this.fullPath(key));
      } catch {
        // ignore
      }
      try {
        await client.remove(this.metaPath(key));
      } catch {
        // ignore
      }
    });
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    return this.withClient(async (client) => {
      const dir = this.fullPath(prefix.endsWith('/') ? prefix : `${prefix}/`);
      const entries: BlobEntry[] = [];
      try {
        const list = await client.list(dir);
        for (const item of list) {
          if (item.isDirectory || item.name.endsWith('.meta.json')) continue;
          const key = `${prefix}${item.name}`;
          const meta = await this.readMeta(client, key);
          entries.push({
            key,
            size: meta?.size ?? item.size,
            lastModified: meta?.lastModified ?? item.modifiedAt?.toISOString()
          });
        }
      } catch {
        // empty
      }
      return entries;
    });
  }

  async mkdir(path: string): Promise<void> {
    return this.withClient(async (client) => {
      await client.ensureDir(this.fullPath(path.endsWith('/') ? path.slice(0, -1) : path));
    });
  }
}
