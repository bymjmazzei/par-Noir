import type { BlobEntry, BlobHead, PutOptions, PutResult } from '../types.js';

/** Provider-agnostic user-owned blob storage */
export interface BlobStore {
  readonly providerId: string;

  put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult>;

  get(key: string): Promise<Uint8Array | null>;

  head(key: string): Promise<BlobHead | null>;

  delete(key: string): Promise<void>;

  list(prefix: string): Promise<BlobEntry[]>;

  /** Ensure logical directory exists (no-op on flat blob stores) */
  mkdir(path: string): Promise<void>;
}
