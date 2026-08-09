/**
 * Public cloud ciphertext access for the public-link feed model.
 *
 * ensure/revoke: caller's own cloud token only (resolveOwnerDriveToken at route layer).
 * fetchPublicBytes: OAuth-less — publicUrl and/or platform GOOGLE_DRIVE_API_KEY.
 * Never builds a Drive token from another user's stored credentials row.
 */
import type { PublicContentRef } from '@par-noir/aggregator-domain';
import { hashIdentifier, safeLogger } from '../../utils/logger';

export class PublicBlobAccessError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'UNSUPPORTED' | 'FETCH_FAILED' | 'CONFIG',
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'PublicBlobAccessError';
  }
}

export function drivePublicDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

/** Final Drive download host (avoids uc→usercontent redirect RTT). */
export function driveUsercontentDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`;
}

export async function ensureDrivePublicReadable(
  accessToken: string,
  fileId: string
): Promise<PublicContentRef> {
  const { setPublicPermissionWithRetry } = await import('./googleApiRetry');
  await setPublicPermissionWithRetry(accessToken, fileId, 'public-media');
  return {
    backend: 'google_drive',
    objectId: fileId,
    publicUrl: drivePublicDownloadUrl(fileId),
  };
}

export async function revokeDrivePublicReadable(accessToken: string, fileId: string): Promise<void> {
  // List permissions and delete type=anyone
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (listRes.status === 404) {
    throw new PublicBlobAccessError('File not found', 'NOT_FOUND', 404);
  }
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => '');
    throw new PublicBlobAccessError(
      `Failed to list permissions: ${listRes.status} ${text.slice(0, 120)}`,
      'FETCH_FAILED',
      502
    );
  }
  const body = (await listRes.json()) as { permissions?: Array<{ id: string; type?: string }> };
  const anyone = (body.permissions || []).filter((p) => p.type === 'anyone');
  for (const perm of anyone) {
    const del = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(perm.id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!del.ok && del.status !== 404) {
      const text = await del.text().catch(() => '');
      safeLogger.warn('[PublicBlobAccess] revoke anyone permission failed', {
        status: del.status,
        fileHash: hashIdentifier(fileId),
        detail: text.slice(0, 80),
      });
      throw new PublicBlobAccessError('Failed to revoke public permission', 'FETCH_FAILED', 502);
    }
  }
}

/**
 * Dropbox / OneDrive / S3 / Azure / FTP: require a durable publicUrl already on the ref.
 * ensure* helpers for those providers live beside their adapters; publish must fail
 * closed if a publicUrl cannot be produced (no embed fallback).
 */
export async function ensurePortablePublicReadable(
  backend: string,
  objectId: string,
  publicUrl: string | undefined
): Promise<PublicContentRef> {
  if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) {
    throw new PublicBlobAccessError(
      `Backend ${backend} cannot expose anonymous ciphertext without a publicUrl`,
      'UNSUPPORTED',
      400
    );
  }
  return { backend, objectId, publicUrl };
}

async function fetchUrlBytes(url: string): Promise<{ status: number; buffer: Buffer; contentType: string | null }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Avoid HTML interstitial where possible
      Accept: 'application/octet-stream,application/json,*/*',
    },
  });
  const contentType = res.headers.get('content-type');
  const ab = await res.arrayBuffer();
  return { status: res.status, buffer: Buffer.from(ab), contentType };
}

function looksLikeHtml(buffer: Buffer, contentType: string | null): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  const head = buffer.subarray(0, 64).toString('utf8').trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

function isUsableCipherBody(
  status: number,
  buffer: Buffer,
  contentType: string | null
): boolean {
  return status >= 200 && status < 300 && buffer.length > 0 && !looksLikeHtml(buffer, contentType);
}

export type FetchPublicBytesTiming = {
  buffer: Buffer;
  primaryMs: number;
  fallbackUsed: boolean;
  fallbackMs: number;
  path: 'usercontent' | 'publicUrl' | 'api_key' | 'other';
};

/**
 * OAuth-less fetch. Drive: usercontent first, then publicUrl (uc), then platform API key.
 * Phase 0 observed: Drive API without key → 403; with key param → accepted path.
 */
export async function fetchPublicBytes(ref: PublicContentRef): Promise<Buffer> {
  const timed = await fetchPublicBytesTimed(ref);
  return timed.buffer;
}

export async function fetchPublicBytesTimed(ref: PublicContentRef): Promise<FetchPublicBytesTiming> {
  if (!ref?.publicUrl) {
    throw new PublicBlobAccessError('publicContentRef.publicUrl required', 'CONFIG', 500);
  }

  const isDrive =
    ref.backend === 'google_drive' || /drive\.google|googleapis\.com\/drive|drive\.usercontent/i.test(ref.publicUrl);

  const tryUrls: Array<{ url: string; path: FetchPublicBytesTiming['path'] }> = [];
  if (isDrive && ref.objectId) {
    tryUrls.push({ url: driveUsercontentDownloadUrl(ref.objectId), path: 'usercontent' });
  }
  if (ref.publicUrl) {
    tryUrls.push({ url: ref.publicUrl, path: 'publicUrl' });
  }

  let primaryMs = 0;
  let lastStatus = 0;
  let lastHtml = false;

  for (const candidate of tryUrls) {
    const t0 = Date.now();
    const result = await fetchUrlBytes(candidate.url);
    primaryMs += Date.now() - t0;
    lastStatus = result.status;
    lastHtml = looksLikeHtml(result.buffer, result.contentType);

    if (result.status === 404 || result.status === 410) {
      throw new PublicBlobAccessError('Public content not found', 'NOT_FOUND', result.status);
    }
    if (result.status === 403 && !isDrive) {
      throw new PublicBlobAccessError('Public content forbidden', 'FORBIDDEN', 403);
    }
    if (isUsableCipherBody(result.status, result.buffer, result.contentType)) {
      return {
        buffer: result.buffer,
        primaryMs,
        fallbackUsed: false,
        fallbackMs: 0,
        path: candidate.path,
      };
    }
  }

  // Drive fallback: platform API key (not owner / peer OAuth)
  if (isDrive) {
    const apiKey = (process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      safeLogger.warn('[PublicBlobAccess] Drive publicUrl fetch unusable and GOOGLE_DRIVE_API_KEY unset', {
        status: lastStatus,
        html: lastHtml,
        objectHash: hashIdentifier(ref.objectId),
      });
      throw new PublicBlobAccessError(
        'Drive public fetch failed and GOOGLE_DRIVE_API_KEY is not configured',
        'CONFIG',
        503
      );
    }
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref.objectId)}?alt=media&key=${encodeURIComponent(apiKey)}`;
    const t1 = Date.now();
    const secondary = await fetchUrlBytes(apiUrl);
    const fallbackMs = Date.now() - t1;
    if (secondary.status === 404 || secondary.status === 410) {
      throw new PublicBlobAccessError('Public content not found', 'NOT_FOUND', secondary.status);
    }
    if (secondary.status === 403) {
      throw new PublicBlobAccessError('Public content forbidden', 'FORBIDDEN', 403);
    }
    if (secondary.status >= 200 && secondary.status < 300 && secondary.buffer.length > 0) {
      return {
        buffer: secondary.buffer,
        primaryMs,
        fallbackUsed: true,
        fallbackMs,
        path: 'api_key',
      };
    }
    throw new PublicBlobAccessError(
      `Drive API key fetch failed: ${secondary.status}`,
      'FETCH_FAILED',
      502
    );
  }

  throw new PublicBlobAccessError(`Public fetch failed: ${lastStatus}`, 'FETCH_FAILED', 502);
}
