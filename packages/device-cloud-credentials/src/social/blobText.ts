import { BlobPreconditionError } from '@par-noir/user-owned-storage';
import type { DeviceBlobStore } from '../deviceBlobStore.js';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export async function readBlobText(blobs: DeviceBlobStore, key: string): Promise<string | null> {
  const raw = await blobs.get(key);
  return raw ? decoder.decode(raw) : null;
}

/**
 * Rewrite one text blob with a conditional put, retrying when another device
 * wrote in between. `edit` returns null to leave the blob as it is.
 */
export async function editBlobText(
  blobs: DeviceBlobStore,
  key: string,
  contentType: string,
  edit: (current: string | null) => string | null,
  attempts = 3
): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    const head = await blobs.head(key);
    const current = head ? await readBlobText(blobs, key) : null;
    const next = edit(current);
    if (next === null) return false;
    try {
      await blobs.put(key, encoder.encode(next), { contentType, ...(head?.etag ? { ifMatch: head.etag } : {}) });
      return true;
    } catch (err) {
      if (!(err instanceof BlobPreconditionError) || attempt >= attempts) throw err;
    }
  }
}

export async function readJsonBlob<T>(blobs: DeviceBlobStore, key: string): Promise<T | null> {
  const text = await readBlobText(blobs, key);
  if (!text?.trim()) return null;
  return JSON.parse(text) as T;
}
