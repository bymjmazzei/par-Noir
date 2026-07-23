import type { BlobStore } from '@par-noir/user-owned-storage';
import type { BlobEntry, BlobHead, PutOptions, PutResult } from '@par-noir/user-owned-storage';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class OneDriveBlobAdapter implements BlobStore {
  readonly providerId = 'onedrive';
  private accessToken: string;
  private rootPrefix: string;

  constructor(accessToken: string, rootPrefix = '') {
    this.accessToken = accessToken;
    this.rootPrefix = rootPrefix.endsWith('/') ? rootPrefix : rootPrefix ? `${rootPrefix}/` : '';
  }

  private itemPath(key: string): string {
    const k = key.startsWith('/') ? key.slice(1) : key;
    const full = `${this.rootPrefix}${k}`;
    // App folder only — Files.ReadWrite.AppFolder
    return `/me/drive/special/approot:/${full}`;
  }

  private async graph<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init?.headers ?? {})
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Graph API error: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    if (options?.ifMatch) {
      const head = await this.head(key);
      if (head?.etag && head.etag !== options.ifMatch) {
        throw new Error('OneDrive etag mismatch');
      }
    }
    const path = `${this.itemPath(key)}:/content`;
    const res = await fetch(`${GRAPH}${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': options?.contentType ?? 'application/octet-stream'
      },
      body: Buffer.from(data)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OneDrive upload error: ${res.status} ${text}`);
    }
    const meta = (await res.json()) as { eTag?: string; id?: string };
    return { etag: meta.eTag, version: meta.id };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(`${GRAPH}${this.itemPath(key)}:/content`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`OneDrive download error: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async head(key: string): Promise<BlobHead | null> {
    try {
      const meta = await this.graph<{
        eTag?: string;
        id?: string;
        size?: number;
        lastModifiedDateTime?: string;
      }>(this.itemPath(key));
      return {
        etag: meta.eTag,
        version: meta.id,
        size: meta.size ?? 0,
        lastModified: meta.lastModifiedDateTime
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.graph(`${this.itemPath(key)}`, { method: 'DELETE' });
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const full = `${this.rootPrefix}${prefix}`.replace(/\/+/g, '/');
    try {
      const result = await this.graph<{
        value?: Array<{
          name: string;
          size?: number;
          lastModifiedDateTime?: string;
          file?: unknown;
        }>;
      }>(`/me/drive/special/approot:/${full}:/children`);
      return (result.value ?? [])
        .filter((v) => v.file)
        .map((v) => ({
          key: `${prefix}${v.name}`,
          size: v.size ?? 0,
          lastModified: v.lastModifiedDateTime
        }));
    } catch {
      return [];
    }
  }

  async mkdir(path: string): Promise<void> {
    const segments = path.replace(/\/$/, '').split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current = current ? `${current}/${seg}` : seg;
      try {
        await this.graph(`${this.itemPath(current)}`, { method: 'GET' });
      } catch {
        await this.graph(`/me/drive/special/approot:/${this.rootPrefix}${current}:`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail'
          })
        });
      }
    }
  }
}
