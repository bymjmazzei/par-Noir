import { describe, expect, it } from 'vitest';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { CONNECTIONS_SCHEMA, JSON_BLOB_PATHS, PORTABLE_LAYOUT_TABLES } from '@par-noir/user-owned-storage';
import { initializeDevicePortableLayout } from './portableLayout.js';
import { createDeviceTableStore } from '../deviceTables.js';

const PN = 'pn-abc';
const ROOT = 'par-noir-pn-abc/';

const s3 = {
  socialCloudProvider: 'aws_s3',
  awsS3Accounts: [
    {
      accountId: 's3a',
      bucket: 'b',
      region: 'us-east-1',
      prefix: `par-noir-${PN}`,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
    },
  ],
} as unknown as StorageCredentialsEnvelope;

function fakeS3() {
  const objects = new Map<string, { body: Uint8Array; etag: string }>();
  let n = 0;
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = decodeURIComponent(new URL(String(url)).pathname);
    const method = init.method ?? 'GET';
    const obj = objects.get(path);
    if (method === 'PUT') {
      const body = typeof init.body === 'string' ? new TextEncoder().encode(init.body) : new Uint8Array(init.body as Uint8Array);
      const etag = `"e${++n}"`;
      objects.set(path, { body, etag });
      return new Response(null, { status: 200, headers: { etag } });
    }
    if (!obj) return new Response(null, { status: 404 });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { etag: obj.etag } });
    return new Response(obj.body as unknown as BodyInit, { status: 200, headers: { etag: obj.etag } });
  }) as typeof fetch;
  const text = (suffix: string) => {
    for (const [path, obj] of objects) {
      if (path.endsWith(suffix)) return new TextDecoder().decode(obj.body);
    }
    return null;
  };
  return { fetchImpl, objects, text };
}

describe('initializeDevicePortableLayout', () => {
  it('writes every layout table and the default blobs, then leaves them alone', async () => {
    const cloud = fakeS3();
    const result = await initializeDevicePortableLayout(PN, s3, {
      fetchImpl: cloud.fetchImpl,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).toEqual({ pathPrefix: ROOT });
    expect(cloud.objects.size).toBe(PORTABLE_LAYOUT_TABLES.length + 2);
    expect(JSON.parse(cloud.text(JSON_BLOB_PATHS.preferences)!)).toEqual({
      identifier: PN,
      updatedAt: '2026-01-01T00:00:00.000Z',
      tagPreferences: [],
    });

    const table = await (await createDeviceTableStore(PN, s3, { fetchImpl: cloud.fetchImpl })).openTable(CONNECTIONS_SCHEMA);
    await table.append({ connectionId: 'c1' });
    const profileBefore = cloud.text(JSON_BLOB_PATHS.profile);

    await initializeDevicePortableLayout(PN, s3, {
      fetchImpl: cloud.fetchImpl,
      now: () => new Date('2027-01-01T00:00:00Z'),
    });
    expect(cloud.text(JSON_BLOB_PATHS.profile)).toBe(profileBefore);
    const reopened = await (await createDeviceTableStore(PN, s3, { fetchImpl: cloud.fetchImpl })).openTable(CONNECTIONS_SCHEMA);
    expect(await reopened.getByKey('c1')).toEqual({ connectionId: 'c1' });
  });

  it('does nothing for a Google Drive social cloud', async () => {
    const cloud = fakeS3();
    const google = { socialCloudProvider: 'google_drive' } as unknown as StorageCredentialsEnvelope;
    expect(await initializeDevicePortableLayout(PN, google, { fetchImpl: cloud.fetchImpl })).toBeNull();
    expect(cloud.objects.size).toBe(0);
  });
});
