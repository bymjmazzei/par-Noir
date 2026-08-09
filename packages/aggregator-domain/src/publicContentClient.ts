/**
 * Client helpers for the public-link feed cache model.
 * Envelope bytes live on owner cloud; API holds only slim publicToken + publicContentRef.
 */

import {
  decryptPublicCiphertext,
  type PublicCipherEnvelope,
  type ShareToken,
} from './tokenDecryption';
import { isPublicCipherEnvelope, isPublicContentRef, type PublicContentRef } from './publicContentRef';
import { envelopeJsonBytes, slimPublicTokenJson, type PublicShareGenerationResult } from './publicShare';

export interface EnsurePublicContentRefParams {
  objectId: string;
  backend?: string;
  apiBase: string;
  /** Auth + cloud-token headers (e.g. ownerApiHeaders / Authorization + X-PN-Cloud-Access-Token) */
  headers: HeadersInit;
  publicUrl?: string;
}

export async function ensurePublicContentRef(
  params: EnsurePublicContentRefParams
): Promise<PublicContentRef> {
  const { objectId, backend = 'google_drive', apiBase, headers, publicUrl } = params;
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(
    `${base}/api/aggregator/public-content/${encodeURIComponent(objectId)}/ensure-public`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string>),
      },
      body: JSON.stringify({ backend, ...(publicUrl ? { publicUrl } : {}) }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`ensure-public failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { publicContentRef?: unknown };
  if (!isPublicContentRef(data.publicContentRef)) {
    throw new Error('ensure-public returned invalid publicContentRef');
  }
  return data.publicContentRef;
}

export async function revokePublicContentRef(params: {
  objectId: string;
  backend?: string;
  apiBase: string;
  headers: HeadersInit;
}): Promise<void> {
  const { objectId, backend = 'google_drive', apiBase, headers } = params;
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(
    `${base}/api/aggregator/public-content/${encodeURIComponent(objectId)}/revoke-public`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string>),
      },
      body: JSON.stringify({ backend }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`revoke-public failed: ${res.status} ${text}`);
  }
}

/**
 * Upload envelope via caller-provided uploader, mark anyone-readable, return API fields.
 */
export async function materializePublicShare(params: {
  generation: PublicShareGenerationResult;
  apiBase: string;
  headers: HeadersInit;
  backend?: string;
  envelopeFileName?: string;
  uploadEnvelope: (blob: Blob, fileName: string) => Promise<{ objectId: string; publicUrl?: string }>;
}): Promise<{ publicToken: string; publicContentRef: PublicContentRef; envelopeObjectId: string }> {
  const backend = params.backend || 'google_drive';
  const fileName = params.envelopeFileName || `public-envelope-${Date.now()}.json`;
  const blob = envelopeJsonBytes(params.generation.envelope);
  const uploaded = await params.uploadEnvelope(blob, fileName);
  const publicContentRef = await ensurePublicContentRef({
    objectId: uploaded.objectId,
    backend,
    apiBase: params.apiBase,
    headers: params.headers,
    publicUrl: uploaded.publicUrl,
  });
  return {
    publicToken: slimPublicTokenJson(params.generation.token),
    publicContentRef,
    envelopeObjectId: uploaded.objectId,
  };
}

export function parseShareKeyFromPublicToken(publicToken: unknown): { shareKey: string; titleHint?: string } {
  const token: ShareToken =
    typeof publicToken === 'string' ? (JSON.parse(publicToken) as ShareToken) : (publicToken as ShareToken);
  if (!token?.shareKey?.trim()) {
    throw new Error('publicToken missing shareKey');
  }
  return { shareKey: token.shareKey, titleHint: token.metadata?.title };
}

/** Blind-proxy fetch of envelope JSON for an indexed public fileId. */
export class PermanentPublicContentError extends Error {
  readonly status: number;
  readonly permanent = true as const;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PermanentPublicContentError';
    this.status = status;
  }
}

export function isPermanentPublicContentError(error: unknown): error is PermanentPublicContentError {
  return (
    error instanceof PermanentPublicContentError ||
    (!!error &&
      typeof error === 'object' &&
      (error as { permanent?: unknown }).permanent === true &&
      typeof (error as { status?: unknown }).status === 'number')
  );
}

/** Align with API Cache-Control max-age=300 for public envelopes. */
const ENVELOPE_CACHE_TTL_MS = 300_000;

const envelopeCache = new Map<string, { envelope: PublicCipherEnvelope; cachedAt: number }>();
const envelopeInFlight = new Map<string, Promise<PublicCipherEnvelope>>();

export function clearPublicEnvelopeCache(fileId?: string): void {
  if (fileId) {
    envelopeCache.delete(fileId);
    envelopeInFlight.delete(fileId);
    return;
  }
  envelopeCache.clear();
  envelopeInFlight.clear();
}

async function fetchPublicEnvelopeUncached(params: {
  fileId: string;
  apiBase: string;
  headers?: HeadersInit;
}): Promise<PublicCipherEnvelope> {
  const base = params.apiBase.replace(/\/$/, '');
  const res = await fetch(
    `${base}/api/aggregator/public-content/${encodeURIComponent(params.fileId)}`,
    { headers: params.headers }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const message = `public-content fetch failed: ${res.status} ${text}`;
    // 4xx (except 408/429) are permanent for this fileId — do not retry in a loop.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PermanentPublicContentError(res.status, message);
    }
    throw new Error(message);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('public-content body is not JSON envelope');
  }
  if (!isPublicCipherEnvelope(parsed)) {
    throw new Error('public-content body is not a valid envelope');
  }
  return parsed;
}

export async function fetchPublicEnvelope(params: {
  fileId: string;
  apiBase: string;
  headers?: HeadersInit;
}): Promise<PublicCipherEnvelope> {
  const { fileId } = params;
  if (!fileId) throw new Error('fileId required for public envelope fetch');

  const cached = envelopeCache.get(fileId);
  if (cached && Date.now() - cached.cachedAt < ENVELOPE_CACHE_TTL_MS) {
    return cached.envelope;
  }

  const existing = envelopeInFlight.get(fileId);
  if (existing) return existing;

  const pending = fetchPublicEnvelopeUncached(params)
    .then((envelope) => {
      envelopeCache.set(fileId, { envelope, cachedAt: Date.now() });
      return envelope;
    })
    .catch((err: unknown) => {
      if (isPermanentPublicContentError(err)) {
        envelopeCache.delete(fileId);
      }
      throw err;
    })
    .finally(() => {
      envelopeInFlight.delete(fileId);
    });

  envelopeInFlight.set(fileId, pending);
  return pending;
}

/** Fetch envelope via blind proxy and decrypt with shareKey from slim publicToken. */
export async function decryptPublicIndexedMedia(params: {
  fileId: string;
  publicToken: unknown;
  apiBase: string;
  headers?: HeadersInit;
  titleHint?: string;
}): Promise<Blob> {
  const { shareKey, titleHint } = parseShareKeyFromPublicToken(params.publicToken);
  const envelope = await fetchPublicEnvelope({
    fileId: params.fileId,
    apiBase: params.apiBase,
    headers: params.headers,
  });
  return decryptPublicCiphertext(envelope, shareKey, params.titleHint || titleHint);
}
