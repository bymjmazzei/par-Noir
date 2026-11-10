/**
 * Blob reads and writes on the owner's non-Google cloud, run on the device with
 * device-held credentials. Keys are relative to the pN root, and object paths
 * match what the API wrote before storage moved to the device:
 * provider base + layout root + key.
 */

import type {
  AwsS3Account,
  AzureBlobAccount,
  BlobEntry,
  DropboxAccount,
  OnedriveAccount,
  StorageCredentialsEnvelope,
  StorageProviderId,
} from '@par-noir/user-owned-storage';
import {
  pnRootFolderName,
  readCachedLayout,
  resolveAccount,
  resolveSocialCloudProvider,
} from '@par-noir/user-owned-storage';
import { accountAccessToken } from './driveTokenResolver.js';
import { getSessionCloudCredentials } from './sessionMemory.js';

export type DeviceBlobProvider = 'dropbox' | 'onedrive' | 'aws_s3' | 'azure_blob';

export interface DeviceBlobStore {
  readonly provider: DeviceBlobProvider;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array | string, contentType?: string): Promise<void>;
  list(prefix?: string): Promise<BlobEntry[]>;
  delete(key: string): Promise<void>;
}

export class DeviceCloudLockedError extends Error {
  constructor() {
    super('Unlock your cloud on this device to reach these files.');
    this.name = 'DeviceCloudLockedError';
  }
}

type Fetch = typeof fetch;

/** Raw provider path for a key. `base` already ends in `/` or is empty. */
interface PathScheme {
  objectPath(key: string): string;
  relative(objectPath: string): string;
}

function withSlash(p: string): string {
  return p && !p.endsWith('/') ? `${p}/` : p;
}

function pathScheme(base: string, layoutRoot: string, pnRoot: string): PathScheme {
  const root = `${withSlash(base)}${layoutRoot}`;
  const strip = (key: string) => {
    let k = key.replace(/^\/+/, '');
    if (layoutRoot && k.startsWith(layoutRoot)) k = k.slice(layoutRoot.length);
    else if (k.startsWith(pnRoot)) k = k.slice(pnRoot.length);
    return k;
  };
  return {
    objectPath: (key) => `${root}${strip(key)}`.replace(/\/+/g, '/'),
    relative: (objectPath) => {
      const p = objectPath.replace(/^\/+/, '');
      return p.startsWith(root) ? p.slice(root.length) : p;
    },
  };
}

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

function bodyOf(bytes: Uint8Array): BodyInit {
  return bytes as unknown as BodyInit;
}

function layoutRootFor(pnIdentifier: string, credentials: StorageCredentialsEnvelope): string {
  const pathPrefix = readCachedLayout(credentials).pathPrefix;
  return withSlash(pathPrefix || pnRootFolderName(pnIdentifier));
}

/**
 * Blob store for one connected non-Google provider. Google Drive files go
 * through deviceDriveCall instead.
 */
export function createDeviceBlobStore(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  opts: {
    provider?: StorageProviderId;
    accountId?: string;
    fetchImpl?: Fetch;
    /** Mailbox silo files sit directly under the provider base, so they pass ''. */
    layoutRoot?: string;
  } = {}
): DeviceBlobStore {
  const provider = opts.provider ?? resolveSocialCloudProvider(credentials);
  const f = opts.fetchImpl ?? fetch;
  const pnRoot = `${pnRootFolderName(pnIdentifier)}/`;
  const layoutRoot = opts.layoutRoot ?? layoutRootFor(pnIdentifier, credentials);

  switch (provider) {
    case 'dropbox': {
      const account = resolveAccount<DropboxAccount>(credentials, 'dropbox', opts.accountId);
      const token = accountAccessToken(account as unknown as Record<string, unknown>);
      if (!token) throw new Error('Dropbox access token missing. Reconnect Dropbox.');
      return dropboxStore(token, pathScheme(pnRoot, layoutRoot, pnRoot), f);
    }
    case 'onedrive': {
      const account = resolveAccount<OnedriveAccount>(credentials, 'onedrive', opts.accountId);
      const token = accountAccessToken(account as unknown as Record<string, unknown>);
      if (!token) throw new Error('OneDrive access token missing. Reconnect OneDrive.');
      return onedriveStore(token, pathScheme(pnRoot, layoutRoot, pnRoot), f);
    }
    case 'aws_s3': {
      const account = resolveAccount<AwsS3Account>(credentials, 'aws_s3', opts.accountId);
      if (!account.accessKeyId || !account.secretAccessKey || !account.bucket || !account.region) {
        throw new Error('S3 credentials incomplete. Reconnect S3.');
      }
      if (!account.prefix) throw new Error('S3 prefix required (par-noir-{pn}).');
      return s3Store(account, pathScheme(account.prefix, layoutRoot, pnRoot), f);
    }
    case 'azure_blob': {
      const account = resolveAccount<AzureBlobAccount>(credentials, 'azure_blob', opts.accountId);
      if (!account.accountName || !account.container || !account.sasToken) {
        throw new Error('Azure container SAS required. Reconnect Azure Blob.');
      }
      if (!account.prefix) throw new Error('Azure prefix required (par-noir-{pn}).');
      return azureStore(account, pathScheme(account.prefix, layoutRoot, pnRoot), f);
    }
    default:
      throw new Error(`No device blob store for provider: ${provider}`);
  }
}

/** Blob store from the unlocked session's credentials. */
export function deviceBlobStoreForSession(
  pnIdentifier: string,
  opts: { provider?: StorageProviderId; accountId?: string; fetchImpl?: Fetch } = {}
): DeviceBlobStore {
  const credentials = getSessionCloudCredentials(pnIdentifier);
  if (!credentials) throw new DeviceCloudLockedError();
  return createDeviceBlobStore(pnIdentifier, credentials, opts);
}

async function failed(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new Error(`${what} failed: ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`);
}

function dropboxStore(token: string, paths: PathScheme, f: Fetch): DeviceBlobStore {
  const API = 'https://api.dropboxapi.com/2';
  const CONTENT = 'https://content.dropboxapi.com/2';
  const auth = { Authorization: `Bearer ${token}` };
  const rpc = (endpoint: string, body: unknown) =>
    f(`${API}${endpoint}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const path = (key: string) => `/${paths.objectPath(key)}`;
  type Entry = { '.tag': string; path_display: string; size?: number; server_modified?: string };

  return {
    provider: 'dropbox',
    async get(key) {
      const res = await f(`${CONTENT}/files/download`, {
        method: 'POST',
        headers: { ...auth, 'Dropbox-API-Arg': JSON.stringify({ path: path(key) }) },
      });
      if (res.status === 409 || res.status === 404) return null;
      if (!res.ok) await failed(res, 'Dropbox download');
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, data) {
      const res = await f(`${CONTENT}/files/upload`, {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path: path(key), mode: 'overwrite' }),
        },
        body: bodyOf(toBytes(data)),
      });
      if (!res.ok) await failed(res, 'Dropbox upload');
    },
    async list(prefix = '') {
      const out: BlobEntry[] = [];
      let res = await rpc('/files/list_folder', {
        path: path(prefix).replace(/\/$/, ''),
        recursive: true,
      });
      for (;;) {
        if (res.status === 409) return out;
        if (!res.ok) await failed(res, 'Dropbox list');
        const page = (await res.json()) as { entries?: Entry[]; has_more?: boolean; cursor?: string };
        for (const e of page.entries ?? []) {
          if (e['.tag'] !== 'file') continue;
          out.push({ key: paths.relative(e.path_display), size: e.size ?? 0, lastModified: e.server_modified });
        }
        if (!page.has_more || !page.cursor) return out;
        res = await rpc('/files/list_folder/continue', { cursor: page.cursor });
      }
    },
    async delete(key) {
      const res = await rpc('/files/delete_v2', { path: path(key) });
      if (res.status === 409) return;
      if (!res.ok) await failed(res, 'Dropbox delete');
    },
  };
}

function onedriveStore(token: string, paths: PathScheme, f: Fetch): DeviceBlobStore {
  const item = (p: string) =>
    `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${p.split('/').map(encodeURIComponent).join('/')}`;
  const auth = { Authorization: `Bearer ${token}` };
  type Child = { name: string; size?: number; lastModifiedDateTime?: string; file?: unknown };

  return {
    provider: 'onedrive',
    async get(key) {
      const res = await f(`${item(paths.objectPath(key))}:/content`, { headers: auth });
      if (res.status === 404) return null;
      if (!res.ok) await failed(res, 'OneDrive download');
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, data, contentType = 'application/octet-stream') {
      const res = await f(`${item(paths.objectPath(key))}:/content`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': contentType },
        body: bodyOf(toBytes(data)),
      });
      if (!res.ok) await failed(res, 'OneDrive upload');
    },
    async list(prefix = '') {
      const folder = paths.objectPath(prefix).replace(/\/$/, '');
      const out: BlobEntry[] = [];
      let url: string | undefined = `${item(folder)}:/children`;
      while (url) {
        const res = await f(url, { headers: auth });
        if (res.status === 404) return out;
        if (!res.ok) await failed(res, 'OneDrive list');
        const page = (await res.json()) as { value?: Child[]; '@odata.nextLink'?: string };
        for (const c of page.value ?? []) {
          if (!c.file) continue;
          out.push({
            key: paths.relative(`${folder}/${c.name}`),
            size: c.size ?? 0,
            lastModified: c.lastModifiedDateTime,
          });
        }
        url = page['@odata.nextLink'];
      }
      return out;
    },
    async delete(key) {
      const res = await f(item(paths.objectPath(key)), { method: 'DELETE', headers: auth });
      if (res.status === 404) return;
      if (!res.ok) await failed(res, 'OneDrive delete');
    },
  };
}

function azureStore(account: AzureBlobAccount, paths: PathScheme, f: Fetch): DeviceBlobStore {
  const sas = account.sasToken!.replace(/^\?/, '');
  const base = `https://${account.accountName}.blob.core.windows.net/${account.container}`;
  const blobUrl = (key: string) =>
    `${base}/${paths.objectPath(key).split('/').map(encodeURIComponent).join('/')}?${sas}`;

  return {
    provider: 'azure_blob',
    async get(key) {
      const res = await f(blobUrl(key));
      if (res.status === 404) return null;
      if (!res.ok) await failed(res, 'Azure download');
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, data, contentType = 'application/octet-stream') {
      const res = await f(blobUrl(key), {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType },
        body: bodyOf(toBytes(data)),
      });
      if (!res.ok) await failed(res, 'Azure upload');
    },
    async list(prefix = '') {
      const out: BlobEntry[] = [];
      let marker = '';
      do {
        const q = new URLSearchParams({ restype: 'container', comp: 'list', prefix: paths.objectPath(prefix) });
        if (marker) q.set('marker', marker);
        const res = await f(`${base}?${q}&${sas}`);
        if (!res.ok) await failed(res, 'Azure list');
        const xml = await res.text();
        for (const blob of xml.match(/<Blob>[\s\S]*?<\/Blob>/g) ?? []) {
          const name = xmlField(blob, 'Name');
          if (!name) continue;
          out.push({
            key: paths.relative(name),
            size: Number(xmlField(blob, 'Content-Length') || 0),
            lastModified: xmlField(blob, 'Last-Modified') || undefined,
          });
        }
        marker = xmlField(xml.replace(/<Blobs>[\s\S]*<\/Blobs>/, ''), 'NextMarker');
      } while (marker);
      return out;
    },
    async delete(key) {
      const res = await f(blobUrl(key), { method: 'DELETE' });
      if (res.status === 404) return;
      if (!res.ok) await failed(res, 'Azure delete');
    },
  };
}

function xmlField(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  if (!m) return '';
  return m[1]!
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', data as unknown as BufferSource));
}

async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

/** RFC 3986 encoding as SigV4 requires. */
function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** AWS Signature V4 request headers for S3 (host is signed but not returned; fetch sets it). */
export async function s3SignedHeaders(req: {
  method: string;
  host: string;
  uri: string;
  canonicalQuery: string;
  payloadHash: string;
  amzDate: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType?: string;
}): Promise<Record<string, string>> {
  const dateStamp = req.amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: req.host,
    'x-amz-content-sha256': req.payloadHash,
    'x-amz-date': req.amzDate,
    ...(req.contentType ? { 'content-type': req.contentType } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [req.method, req.uri, req.canonicalQuery, canonicalHeaders, signedHeaders, req.payloadHash].join(
    '\n'
  );
  const scope = `${dateStamp}/${req.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', req.amzDate, scope, await sha256Hex(enc.encode(canonicalRequest))].join('\n');
  let key: ArrayBuffer = await hmac(enc.encode(`AWS4${req.secretAccessKey}`), dateStamp);
  for (const part of [req.region, 's3', 'aws4_request']) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));
  const { host: _host, ...send } = headers;
  void _host;
  return {
    ...send,
    Authorization: `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function s3Store(account: AwsS3Account, paths: PathScheme, f: Fetch): DeviceBlobStore {
  const host = `${account.bucket}.s3.${account.region}.amazonaws.com`;

  async function signed(
    method: string,
    objectPath: string,
    query: Record<string, string>,
    body: Uint8Array,
    contentType?: string
  ): Promise<Response> {
    const uri = `/${objectPath.split('/').map(awsEncode).join('/')}`.replace(/\/+/g, '/');
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${awsEncode(k)}=${awsEncode(query[k]!)}`)
      .join('&');
    const headers = await s3SignedHeaders({
      method,
      host,
      uri,
      canonicalQuery,
      payloadHash: await sha256Hex(body),
      amzDate: new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
      region: account.region,
      accessKeyId: account.accessKeyId,
      secretAccessKey: account.secretAccessKey,
      contentType,
    });
    return f(`https://${host}${uri}${canonicalQuery ? `?${canonicalQuery}` : ''}`, {
      method,
      headers,
      body: method === 'PUT' ? bodyOf(body) : undefined,
    });
  }

  const empty = new Uint8Array();

  return {
    provider: 'aws_s3',
    async get(key) {
      const res = await signed('GET', paths.objectPath(key), {}, empty);
      if (res.status === 404) return null;
      if (!res.ok) await failed(res, 'S3 download');
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, data, contentType = 'application/octet-stream') {
      const res = await signed('PUT', paths.objectPath(key), {}, toBytes(data), contentType);
      if (!res.ok) await failed(res, 'S3 upload');
    },
    async list(prefix = '') {
      const out: BlobEntry[] = [];
      let token = '';
      do {
        const query: Record<string, string> = { 'list-type': '2', prefix: paths.objectPath(prefix) };
        if (token) query['continuation-token'] = token;
        const res = await signed('GET', '', query, empty);
        if (!res.ok) await failed(res, 'S3 list');
        const xml = await res.text();
        for (const item of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
          const name = xmlField(item, 'Key');
          if (!name) continue;
          out.push({
            key: paths.relative(name),
            size: Number(xmlField(item, 'Size') || 0),
            lastModified: xmlField(item, 'LastModified') || undefined,
          });
        }
        token = xmlField(xml, 'IsTruncated') === 'true' ? xmlField(xml, 'NextContinuationToken') : '';
      } while (token);
      return out;
    },
    async delete(key) {
      const res = await signed('DELETE', paths.objectPath(key), {}, empty);
      if (res.status === 404) return;
      if (!res.ok) await failed(res, 'S3 delete');
    },
  };
}
