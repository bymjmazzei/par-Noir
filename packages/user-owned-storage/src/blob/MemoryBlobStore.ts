import type { BlobEntry, BlobHead, PutOptions, PutResult } from '../types.js';
import type { BlobStore } from './BlobStore.js';

interface StoredBlob {
  data: Uint8Array;
  etag: string;
  lastModified: string;
}

/**
 * In-memory BlobStore for tests and local development.
 */
export class MemoryBlobStore implements BlobStore {
  readonly providerId = 'memory';
  private blobs = new Map<string, StoredBlob>();

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    const existing = this.blobs.get(key);
    if (options?.ifMatch && existing && existing.etag !== options.ifMatch) {
      throw new BlobPreconditionError('etag mismatch');
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const etag = `${Date.now()}-${bytes.length}`;
    this.blobs.set(key, {
      data: bytes,
      etag,
      lastModified: new Date().toISOString()
    });
    return { etag, version: etag };
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key)?.data ?? null;
  }

  async head(key: string): Promise<BlobHead | null> {
    const blob = this.blobs.get(key);
    if (!blob) return null;
    return {
      etag: blob.etag,
      version: blob.etag,
      size: blob.data.length,
      lastModified: blob.lastModified
    };
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const entries: BlobEntry[] = [];
    for (const [key, blob] of this.blobs) {
      if (key.startsWith(prefix)) {
        entries.push({
          key,
          size: blob.data.length,
          lastModified: blob.lastModified
        });
      }
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  async mkdir(_path: string): Promise<void> {
    // no-op
  }
}

export class BlobPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlobPreconditionError';
  }
}
