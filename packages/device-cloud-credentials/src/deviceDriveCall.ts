/**
 * Drive I/O from the device. The provider access token is sent to Google,
 * never to the par Noir API.
 */

import { getCloudAccessTokenFromSession } from './ownerCloudHeaders.js';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';

export type DeviceDriveInit = {
  accessToken: string;
  fetchImpl?: typeof fetch;
};

function authHeaders(token: string, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function google(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetchImpl(url, {
    ...init,
    headers: authHeaders(token, init?.headers as Record<string, string> | undefined),
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Translate the dashboard's former `/api/drive/*` calls into Google Drive requests.
 * Response shapes match what GoogleDriveBackend already parses.
 */
export async function deviceDriveCall(
  method: string,
  path: string,
  body: unknown,
  init: DeviceDriveInit
): Promise<Response> {
  const fetchImpl = init.fetchImpl || fetch;
  const token = init.accessToken;
  const url = new URL(path, 'https://device.local');
  const verb = method.toUpperCase();

  if (verb === 'GET' && url.pathname === '/api/drive/files') {
    const params = new URLSearchParams({
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
      pageSize: url.searchParams.get('pageSize') || '100',
    });
    let q = url.searchParams.get('q');
    if (!q && url.searchParams.get('scope') === 'sharedWithMe') {
      q = 'sharedWithMe = true';
    }
    if (q) params.set('q', q);
    const pageToken = url.searchParams.get('pageToken');
    if (pageToken) params.set('pageToken', pageToken);
    const res = await google(fetchImpl, token, `${DRIVE}/files?${params.toString()}`);
    if (!res.ok) return res;
    const data = (await res.json()) as { files?: unknown[]; nextPageToken?: string };
    return jsonResponse(200, {
      files: data.files || [],
      ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
    });
  }

  const fileMatch = url.pathname.match(/^\/api\/drive\/files\/([^/]+)$/);
  if (fileMatch && verb === 'GET') {
    const id = decodeURIComponent(fileMatch[1]);
    if (url.searchParams.get('download') === 'true' || url.searchParams.get('thumbnail') === 'true') {
      return google(fetchImpl, token, `${DRIVE}/files/${encodeURIComponent(id)}?alt=media`);
    }
    const res = await google(
      fetchImpl,
      token,
      `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,modifiedTime,parents`
    );
    if (!res.ok) return res;
    const file = await res.json();
    return jsonResponse(200, { file });
  }

  if (fileMatch && verb === 'DELETE') {
    const id = decodeURIComponent(fileMatch[1]);
    const res = await google(fetchImpl, token, `${DRIVE}/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.status === 204) return new Response(null, { status: 200 });
    return res;
  }

  if (fileMatch && verb === 'PUT') {
    const id = decodeURIComponent(fileMatch[1]);
    const patch = (body || {}) as { name?: string };
    const res = await google(fetchImpl, token, `${DRIVE}/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: patch.name }),
    });
    if (!res.ok) return res;
    const file = await res.json();
    return jsonResponse(200, { file });
  }

  const contentMatch = url.pathname.match(/^\/api\/drive\/files\/([^/]+)\/content$/);
  if (contentMatch && verb === 'PUT') {
    const id = decodeURIComponent(contentMatch[1]);
    const payload = (body || {}) as { fileData?: string; mimeType?: string };
    const bytes = b64ToBytes(payload.fileData || '');
    const res = await google(
      fetchImpl,
      token,
      `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': payload.mimeType || 'application/octet-stream' },
        body: bytes as unknown as BodyInit,
      }
    );
    if (!res.ok) return res;
    const file = await res.json();
    return jsonResponse(200, { file });
  }

  if (verb === 'POST' && url.pathname === '/api/drive/native') {
    const payload = (body || {}) as { fileName?: string; mimeType?: string; parents?: string[] };
    const res = await google(fetchImpl, token, `${DRIVE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.fileName,
        mimeType: payload.mimeType,
        parents: payload.parents,
      }),
    });
    if (!res.ok) return res;
    const file = await res.json();
    return jsonResponse(200, { file });
  }

  if (verb === 'POST' && url.pathname === '/api/drive/folders') {
    const payload = (body || {}) as { folderName?: string; parentFolderId?: string };
    const metadata: Record<string, unknown> = {
      name: payload.folderName,
      mimeType: FOLDER,
    };
    if (payload.parentFolderId) metadata.parents = [payload.parentFolderId];
    const res = await google(fetchImpl, token, `${DRIVE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) return res;
    const folder = await res.json();
    return jsonResponse(200, { folder });
  }

  if (verb === 'POST' && url.pathname === '/api/drive/files') {
    const payload = (body || {}) as {
      fileData?: string;
      fileName?: string;
      mimeType?: string;
      parents?: string[];
    };
    const boundary = 'pn_device_drive';
    const meta = JSON.stringify({
      name: payload.fileName,
      parents: payload.parents,
    });
    const bytes = b64ToBytes(payload.fileData || '');
    const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${payload.mimeType || 'application/octet-stream'}\r\n\r\n`;
    const ending = `\r\n--${boundary}--`;
    const head = new TextEncoder().encode(preamble);
    const tail = new TextEncoder().encode(ending);
    const blob = new Uint8Array(head.length + bytes.length + tail.length);
    blob.set(head, 0);
    blob.set(bytes, head.length);
    blob.set(tail, head.length + bytes.length);
    const res = await google(fetchImpl, token, `${UPLOAD}?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: blob as unknown as BodyInit,
    });
    if (!res.ok) return res;
    const file = await res.json();
    return jsonResponse(200, { file });
  }

  return jsonResponse(404, { error: 'device_drive_path_unsupported', path: url.pathname });
}

/** `/api/drive/...` on a relative path or an absolute API URL. Null for every other route. */
export function extractApiDrivePath(pathOrUrl: string): string | null {
  const raw = pathOrUrl.trim();
  if (raw.startsWith('/api/drive/')) return raw;
  try {
    const u = new URL(raw);
    if (u.pathname.startsWith('/api/drive/')) return `${u.pathname}${u.search}`;
  } catch {
    /* not a URL */
  }
  return null;
}

function cloudOnDeviceResponse(): Response {
  return jsonResponse(409, {
    error: 'cloud_on_device',
    error_description: 'Drive reads and writes run on the device.',
  });
}

/**
 * Drive proxy paths go to Google with the session token.
 * Returns null when the path is not Drive, so the caller can hit the API.
 */
export async function fetchDeviceDriveForSession(opts: {
  method: string;
  pathOrUrl: string;
  body?: unknown;
  pnIdentifier?: string | null;
}): Promise<Response | null> {
  const path = extractApiDrivePath(opts.pathOrUrl);
  if (!path) return null;
  const token = opts.pnIdentifier ? getCloudAccessTokenFromSession(opts.pnIdentifier) : null;
  if (!token) return cloudOnDeviceResponse();
  return deviceDriveCall(opts.method, path, opts.body, { accessToken: token });
}
