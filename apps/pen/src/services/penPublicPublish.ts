/**
 * Publish a public artifact from Pen onto the owner's cloud, then index it.
 * Aggregators read the index. They do not receive the file through Browse.
 */

import {
  FEED_PREVIEW_POSTER_MAX_BYTES,
  FEED_PREVIEW_SD_MAX_BYTES,
  materializePublicShare,
  r2ObjectKey,
  sealPublicShareFromBytes,
  type FeedPreviewObjectRef
} from '@par-noir/aggregator-domain';
import { getCloudAccessTokenFromSession, shareDeviceDriveFile } from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch } from './penOwnerFetch';
import { loadPenSession } from './penSession';

export type CloudRequest = (
  method: string,
  path: string,
  body?: unknown
) => Promise<Response>;

export function defaultCloudRequest(): CloudRequest {
  return (method, path, body) => ownerFetch(method, path, body);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function uploadDriveFile(
  request: CloudRequest,
  fileName: string,
  mimeType: string,
  base64: string
): Promise<string> {
  const res = await request('POST', '/api/drive/files', {
    fileData: base64,
    fileName,
    mimeType,
    encrypt: false
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`drive_upload_failed_${res.status} ${text}`);
  }
  const data = (await res.json()) as { id?: string; file?: { id?: string } };
  const id = data.id || data.file?.id;
  if (!id) throw new Error('drive_upload_missing_id');
  return id;
}

async function uploadFeedVariant(params: {
  request: CloudRequest;
  fileId: string;
  variant: 'poster' | 'sd';
  blob: Blob;
  contentType: string;
}): Promise<FeedPreviewObjectRef> {
  const byteSize = params.blob.size;
  const presignRes = await params.request('POST', '/api/aggregator/feed-media/presign-upload', {
    fileId: params.fileId,
    variant: params.variant,
    contentType: params.contentType,
    contentLength: byteSize,
    planId: 'floor'
  });
  if (!presignRes.ok) {
    const err = (await presignRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `presign_failed_${presignRes.status}`);
  }
  const presign = (await presignRes.json()) as { url: string; key: string };
  const put = await fetch(presign.url, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    body: params.blob
  });
  if (!put.ok) throw new Error(`r2_put_failed_${put.status}`);

  const ownerId = await uploadDriveFile(
    params.request,
    `feed-preview-${params.fileId}-${params.variant}`,
    params.contentType,
    await blobToBase64(params.blob)
  );
  const pn = loadPenSession()?.pnIdentifier;
  const cloudToken = pn ? getCloudAccessTokenFromSession(pn) : null;
  const publicUrl = cloudToken ? await shareDeviceDriveFile(cloudToken, ownerId) : '';
  const ensureRes = await params.request(
    'POST',
    `/api/aggregator/public-content/${encodeURIComponent(ownerId)}/ensure-public`,
    publicUrl
      ? { backend: 'google_drive', publicContentRef: { backend: 'google_drive', objectId: ownerId, publicUrl } }
      : { backend: 'google_drive' }
  );
  if (!ensureRes.ok) throw new Error(`ensure_public_canonical_failed_${ensureRes.status}`);
  const ensured = (await ensureRes.json()) as {
    publicContentRef?: { objectId: string; publicUrl: string; backend: string };
  };
  if (!ensured.publicContentRef?.publicUrl) throw new Error('ensure_public_canonical_missing_ref');

  const ref: FeedPreviewObjectRef = {
    r2Key: presign.key || r2ObjectKey(params.fileId, params.variant),
    ownerObjectId: ensured.publicContentRef.objectId,
    ownerBackend: ensured.publicContentRef.backend,
    ownerPublicUrl: ensured.publicContentRef.publicUrl,
    contentType: params.contentType,
    byteSize,
    r2Warm: true,
    lastPlayedAt: new Date().toISOString()
  };
  const confirmRes = await params.request('POST', '/api/aggregator/feed-media/confirm-upload', {
    fileId: params.fileId,
    variant: params.variant,
    ref
  });
  if (!confirmRes.ok) throw new Error(`confirm_upload_failed_${confirmRes.status}`);
  return ref;
}

export async function publishPublicCloudFile(params: {
  request?: CloudRequest;
  bytes: Uint8Array;
  fileName: string;
  title: string;
  metadata: Record<string, unknown>;
  poster?: Blob;
  posterContentType?: string;
  /** When set, a public video row also gets an SD preview (API requires it). */
  videoForSd?: Blob;
  videoContentType?: string;
}): Promise<{ fileId: string }> {
  const request = params.request || defaultCloudRequest();
  const generation = await sealPublicShareFromBytes({
    bytes: params.bytes,
    title: params.title,
    fileIdHint: params.fileName
  });
  const materialized = await materializePublicShare({
    generation,
    apiBase: API_ENDPOINT,
    request,
    envelopeFileName: params.fileName,
    uploadEnvelope: async (blob, fileName) => {
      const objectId = await uploadDriveFile(
        request,
        fileName,
        'application/json',
        await blobToBase64(blob)
      );
      const pn = loadPenSession()?.pnIdentifier;
      const cloudToken = pn ? getCloudAccessTokenFromSession(pn) : null;
      const publicUrl = cloudToken ? await shareDeviceDriveFile(cloudToken, objectId) : undefined;
      return { objectId, publicUrl };
    }
  });
  const fileId = materialized.envelopeObjectId;

  let feedPoster: FeedPreviewObjectRef | undefined;
  const posterType = params.posterContentType || 'image/jpeg';
  if (params.poster && params.poster.size > 0 && params.poster.size <= FEED_PREVIEW_POSTER_MAX_BYTES) {
    feedPoster = await uploadFeedVariant({
      request,
      fileId,
      variant: 'poster',
      blob: params.poster,
      contentType: posterType
    });
  }

  let feedPreviewSd: FeedPreviewObjectRef | undefined;
  if (params.videoForSd && params.videoForSd.size > 0) {
    const videoFits = params.videoForSd.size <= FEED_PREVIEW_SD_MAX_BYTES;
    const sdBlob = videoFits ? params.videoForSd : params.poster;
    const sdType = videoFits ? params.videoContentType || 'video/webm' : posterType;
    if (sdBlob && sdBlob.size > 0 && sdBlob.size <= FEED_PREVIEW_SD_MAX_BYTES) {
      feedPreviewSd = await uploadFeedVariant({
        request,
        fileId,
        variant: 'sd',
        blob: sdBlob,
        contentType: sdType
      });
    }
  }

  const put = await request('PUT', `/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`, {
    ...params.metadata,
    name: params.fileName,
    title: params.title,
    isPublic: true,
    publicToken: materialized.publicToken,
    publicContentRef: materialized.publicContentRef,
    ...(feedPoster ? { feedPoster } : {}),
    ...(feedPreviewSd ? { feedPreviewSd } : {}),
    uploadDate: new Date().toISOString()
  });
  if (!put.ok) {
    const text = await put.text().catch(() => put.statusText);
    throw new Error(`metadata_index_${put.status} ${text}`);
  }
  return { fileId };
}

/** Floor poster from the note title/body when the feed tile is not captured. */
export async function renderNotePoster(title: string, text: string): Promise<Blob | undefined> {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f5f5f4';
  ctx.font = '28px sans-serif';
  const source = (text || title || 'Note').replace(/\s+/g, ' ').trim();
  const words = source.split(' ');
  let line = '';
  let y = 80;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 300) {
      ctx.fillText(line, 28, y);
      line = word;
      y += 36;
      if (y > 580) break;
    } else {
      line = next;
    }
  }
  if (line && y <= 580) ctx.fillText(line, 28, y);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.72);
  });
  return blob && blob.size <= FEED_PREVIEW_POSTER_MAX_BYTES ? blob : undefined;
}
