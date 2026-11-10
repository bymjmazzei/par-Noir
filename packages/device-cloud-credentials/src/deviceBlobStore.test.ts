import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  createDeviceBlobStore,
  DeviceCloudLockedError,
  deviceBlobStoreForSession,
  s3SignedHeaders,
} from './deviceBlobStore.js';
import { clearAllSessionCloudCredentials } from './sessionMemory.js';

const PN = 'pn-abc';
const ROOT = 'par-noir-pn-abc';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const s3: StorageCredentialsEnvelope = {
  socialCloudProvider: 'aws_s3',
  awsS3Accounts: [
    {
      accountId: 's3-1',
      bucket: 'bkt',
      region: 'us-east-1',
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
      prefix: `par-noir-${PN}`,
    },
  ],
} as StorageCredentialsEnvelope;

afterEach(() => clearAllSessionCloudCredentials());

describe('s3SignedHeaders', () => {
  it('matches the AWS SigV4 "GET Bucket" example', async () => {
    const headers = await s3SignedHeaders({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      uri: '/',
      canonicalQuery: 'max-keys=2&prefix=J',
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      amzDate: '20130524T000000Z',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
        'Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7'
    );
  });
});

describe('createDeviceBlobStore', () => {
  it('writes S3 objects under prefix + pN root, the layout the API used', async () => {
    const { f, calls } = fakeFetch(() => new Response('', { status: 200 }));
    await createDeviceBlobStore(PN, s3, { fetchImpl: f }).put('encrypted/media/x.bin', new Uint8Array([1]));
    expect(calls[0]!.url).toBe(`https://bkt.s3.us-east-1.amazonaws.com/par-noir-${PN}/${ROOT}/encrypted/media/x.bin`);
    expect(calls[0]!.init.method).toBe('PUT');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it('accepts keys that already carry the pN root', async () => {
    const { f, calls } = fakeFetch(() => new Response(null, { status: 404 }));
    expect(await createDeviceBlobStore(PN, s3, { fetchImpl: f }).get(`${ROOT}/a.json`)).toBeNull();
    expect(calls[0]!.url).toBe(`https://bkt.s3.us-east-1.amazonaws.com/par-noir-${PN}/${ROOT}/a.json`);
  });

  it('pages S3 listings and returns keys relative to the pN root', async () => {
    const pages = [
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t2</NextContinuationToken>
        <Contents><Key>par-noir-${PN}/${ROOT}/_metadata/a.json</Key><Size>3</Size><LastModified>2026-01-01</LastModified></Contents>
      </ListBucketResult>`,
      `<ListBucketResult><IsTruncated>false</IsTruncated>
        <Contents><Key>par-noir-${PN}/${ROOT}/_metadata/b&amp;c.json</Key><Size>5</Size></Contents>
      </ListBucketResult>`,
    ];
    const { f, calls } = fakeFetch(() => new Response(pages.shift()!, { status: 200 }));
    const entries = await createDeviceBlobStore(PN, s3, { fetchImpl: f }).list('_metadata/');
    expect(entries).toEqual([
      { key: '_metadata/a.json', size: 3, lastModified: '2026-01-01' },
      { key: '_metadata/b&c.json', size: 5, lastModified: undefined },
    ]);
    expect(calls[1]!.url).toContain('continuation-token=t2');
  });

  it('uses the Azure container SAS and never a connection string', async () => {
    const azure = {
      socialCloudProvider: 'azure_blob',
      azureBlobAccounts: [
        { accountId: 'az', accountName: 'acct', container: 'c', sasToken: '?sv=1&sig=x', prefix: `par-noir-${PN}` },
      ],
    } as StorageCredentialsEnvelope;
    const { f, calls } = fakeFetch(() => new Response('', { status: 201 }));
    await createDeviceBlobStore(PN, azure, { fetchImpl: f }).put('k.bin', 'hi');
    expect(calls[0]!.url).toBe(`https://acct.blob.core.windows.net/c/par-noir-${PN}/${ROOT}/k.bin?sv=1&sig=x`);
    expect((calls[0]!.init.headers as Record<string, string>)['x-ms-blob-type']).toBe('BlockBlob');
  });

  it('treats a Dropbox 409 as a missing file', async () => {
    const dropbox = {
      socialCloudProvider: 'dropbox',
      dropboxAccounts: [{ accountId: 'db', accessToken: 'tok' }],
    } as unknown as StorageCredentialsEnvelope;
    const { f, calls } = fakeFetch(() => new Response('{}', { status: 409 }));
    expect(await createDeviceBlobStore(PN, dropbox, { fetchImpl: f }).get('a.json')).toBeNull();
    expect(JSON.parse((calls[0]!.init.headers as Record<string, string>)['Dropbox-API-Arg']!)).toEqual({
      path: `/${ROOT}/${ROOT}/a.json`,
    });
  });

  it('keys mailbox silo files from the provider base when layoutRoot is empty', async () => {
    const { f, calls } = fakeFetch(() => new Response('', { status: 200 }));
    await createDeviceBlobStore(PN, s3, { fetchImpl: f, layoutRoot: '' }).put('par-noir-messages/n.jsonl', 'x');
    expect(calls[0]!.url).toBe(`https://bkt.s3.us-east-1.amazonaws.com/par-noir-${PN}/par-noir-messages/n.jsonl`);
  });

  it('refuses Google Drive, which goes through deviceDriveCall', () => {
    expect(() => createDeviceBlobStore(PN, { socialCloudProvider: 'google_drive' } as StorageCredentialsEnvelope)).toThrow(
      /No device blob store/
    );
  });
});

describe('deviceBlobStoreForSession', () => {
  it('fails locked when the session holds no credentials', () => {
    expect(() => deviceBlobStoreForSession(PN)).toThrow(DeviceCloudLockedError);
  });
});
