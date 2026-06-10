import type { BlobStore } from '@par-noir/user-owned-storage';
import type { BlobEntry, BlobHead, PutOptions, PutResult } from '@par-noir/user-owned-storage';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export class DropboxBlobAdapter implements BlobStore {
  readonly providerId = 'dropbox';
  private accessToken: string;
  private rootPrefix: string;

  constructor(accessToken: string, rootPrefix = '') {
    this.accessToken = accessToken;
    this.rootPrefix = rootPrefix.endsWith('/') ? rootPrefix : rootPrefix ? `${rootPrefix}/` : '';
  }

  private fullPath(key: string): string {
    const k = key.startsWith('/') ? key.slice(1) : key;
    return `/${this.rootPrefix}${k}`;
  }

  private async rpc<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dropbox API error: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    const path = this.fullPath(key);
    if (options?.ifMatch) {
      const head = await this.head(key);
      if (head?.etag && head.etag !== options.ifMatch) {
        throw new Error('Dropbox etag mismatch');
      }
    }
    const res = await fetch(`${CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite' })
      },
      body: Buffer.from(data)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dropbox upload error: ${res.status} ${text}`);
    }
    const meta = (await res.json()) as { rev: string };
    return { etag: meta.rev, version: meta.rev };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(`${CONTENT}/files/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path: this.fullPath(key) })
        }
      });
      if (res.status === 409) return null;
      if (!res.ok) throw new Error(`Dropbox download error: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async head(key: string): Promise<BlobHead | null> {
    try {
      const meta = await this.rpc<{
        rev: string;
        size: number;
        server_modified: string;
      }>('/files/get_metadata', { path: this.fullPath(key) });
      return {
        etag: meta.rev,
        version: meta.rev,
        size: meta.size,
        lastModified: meta.server_modified
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.rpc('/files/delete_v2', { path: this.fullPath(key) });
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const path = this.fullPath(prefix.endsWith('/') ? prefix : `${prefix}/`);
    const result = await this.rpc<{
      entries: Array<{ name: string; path_display: string; size?: number; server_modified?: string }>;
    }>('/files/list_folder', { path, recursive: true });
    const base = this.rootPrefix;
    return (result.entries ?? [])
      .filter((e) => !e.name.endsWith('/'))
      .map((e) => ({
        key: e.path_display.replace(/^\//, '').replace(new RegExp(`^${base}`), ''),
        size: e.size ?? 0,
        lastModified: e.server_modified
      }));
  }

  async mkdir(path: string): Promise<void> {
    const full = this.fullPath(path.endsWith('/') ? path.slice(0, -1) : path);
    try {
      await this.rpc('/files/create_folder_v2', { path: full, autorename: false });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? '');
      if (msg.includes('path/conflict/folder')) return;
      throw err;
    }
  }
}
