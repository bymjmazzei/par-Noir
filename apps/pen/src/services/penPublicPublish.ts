/**
 * Publish a public artifact from Pen onto the owner's cloud, then index it.
 * Aggregators read the index. They do not receive the file through Browse.
 */

import {
  FEED_PREVIEW_POSTER_MAX_BYTES,
  materializePublicShare,
  r2ObjectKey,
  sealPublicShareFromBytes,
  validateFeedPreviewByteSize,
  type FeedPreviewObjectRef,
  type FeedPreviewVariant
} from '@par-noir/aggregator-domain';
import { getCloudAccessTokenFromSession, shareDeviceDriveFile } from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch } from './penOwnerFetch';
import { loadPenSession } from './penSession';
import { PEN_PUBLISH_PLAN_ID } from './penPublishPlan';

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
  base64: string,
  parentFolderId: string
): Promise<string> {
  const res = await request('POST', '/api/drive/files', {
    fileData: base64,
    fileName,
    mimeType,
    encrypt: false,
    parents: [parentFolderId]
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

/** Overwrite an existing Drive envelope so the index fileId stays stable across post updates. */
async function overwriteDriveFile(
  request: CloudRequest,
  fileId: string,
  mimeType: string,
  base64: string
): Promise<string> {
  const res = await request('PUT', `/api/drive/files/${encodeURIComponent(fileId)}/content`, {
    fileData: base64,
    mimeType
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`drive_overwrite_failed_${res.status} ${text}`);
  }
  return fileId;
}

/** One CDN preview variant ready to upload (poster / sd / hd). */
export type FeedPreviewUpload = {
  blob: Blob;
  contentType: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type FeedPreviewUploads = {
  poster?: FeedPreviewUpload;
  sd?: FeedPreviewUpload;
  hd?: FeedPreviewUpload;
};

/** Poster-only previews for still / note rows. */
export function posterPreview(
  blob: Blob | undefined,
  contentType = 'image/jpeg'
): FeedPreviewUploads | undefined {
  return blob && blob.size > 0 ? { poster: { blob, contentType } } : undefined;
}

async function uploadFeedVariant(params: {
  request: CloudRequest;
  fileId: string;
  variant: FeedPreviewVariant;
  preview: FeedPreviewUpload;
  parentFolderId: string;
}): Promise<FeedPreviewObjectRef> {
  const { blob, contentType } = params.preview;
  const byteSize = blob.size;
  const query = new URLSearchParams({
    fileId: params.fileId,
    variant: params.variant,
    contentType,
    planId: PEN_PUBLISH_PLAN_ID
  });
  const uploadRes = await params.request(
    'POST',
    `/api/aggregator/feed-media/owner-upload?${query.toString()}`,
    blob.slice(0, byteSize, 'application/octet-stream')
  );
  if (!uploadRes.ok) {
    const err = (await uploadRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `r2_owner_upload_failed_${uploadRes.status}`);
  }
  const uploaded = (await uploadRes.json()) as { key?: string };
  const r2Key = uploaded.key || r2ObjectKey(params.fileId, params.variant);

  const ownerId = await uploadDriveFile(
    params.request,
    `feed-preview-${params.fileId}-${params.variant}`,
    contentType,
    await blobToBase64(blob),
    params.parentFolderId
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
    r2Key: r2Key || r2ObjectKey(params.fileId, params.variant),
    ownerObjectId: ensured.publicContentRef.objectId,
    ownerBackend: ensured.publicContentRef.backend,
    ownerPublicUrl: ensured.publicContentRef.publicUrl,
    contentType,
    byteSize,
    ...(params.preview.width ? { width: params.preview.width } : {}),
    ...(params.preview.height ? { height: params.preview.height } : {}),
    ...(params.preview.durationMs ? { durationMs: params.preview.durationMs } : {}),
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
  /** CDN preview variants. Public video rows need poster + sd (API requires it); hd when available. */
  previews?: FeedPreviewUploads;
  /** par-noir-pen/{docId}/public/ */
  parentFolderId: string;
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
  };
  /**
   * When set, overwrite this Drive envelope and PUT the same metadata-index fileId
   * so engagement on the existing post is preserved.
   */
  replaceFileId?: string;
}): Promise<{ fileId: string }> {
  const request = params.request || defaultCloudRequest();
  const replaceFileId = params.replaceFileId?.trim() || undefined;
  const generation = await sealPublicShareFromBytes({
    bytes: params.bytes,
    title: params.title,
    fileIdHint: replaceFileId || params.fileName
  });
  const materialized = await materializePublicShare({
    generation,
    apiBase: API_ENDPOINT,
    request,
    envelopeFileName: params.fileName,
    uploadEnvelope: async (blob, fileName) => {
      const base64 = await blobToBase64(blob);
      const objectId = replaceFileId
        ? await overwriteDriveFile(request, replaceFileId, 'application/json', base64)
        : await uploadDriveFile(
            request,
            fileName,
            'application/json',
            base64,
            params.parentFolderId
          );
      const pn = loadPenSession()?.pnIdentifier;
      const cloudToken = pn ? getCloudAccessTokenFromSession(pn) : null;
      const publicUrl = cloudToken ? await shareDeviceDriveFile(cloudToken, objectId) : undefined;
      return { objectId, publicUrl };
    }
  });
  const fileId = materialized.envelopeObjectId;

  const previews = params.previews || {};
  const upload = (variant: FeedPreviewVariant, preview: FeedPreviewUpload) =>
    uploadFeedVariant({ request, fileId, variant, preview, parentFolderId: params.parentFolderId });

  let feedPoster: FeedPreviewObjectRef | undefined;
  const poster = previews.poster;
  if (poster && poster.blob.size > 0 && poster.blob.size <= FEED_PREVIEW_POSTER_MAX_BYTES) {
    feedPoster = await upload('poster', poster);
  }

  const videoRefs: { feedPreviewSd?: FeedPreviewObjectRef; feedPreviewHd?: FeedPreviewObjectRef } = {};
  for (const variant of ['sd', 'hd'] as const) {
    const preview = previews[variant];
    if (!preview || preview.blob.size === 0) continue;
    const sizeCheck = validateFeedPreviewByteSize(variant, preview.blob.size);
    if (!sizeCheck.ok) throw new Error(sizeCheck.error);
    const ref = await upload(variant, preview);
    if (variant === 'sd') videoRefs.feedPreviewSd = ref;
    else videoRefs.feedPreviewHd = ref;
  }

  const isUpdate = Boolean(replaceFileId);
  const put = await request('PUT', `/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`, {
    ...params.metadata,
    name: params.fileName,
    title: params.title,
    isPublic: true,
    publicToken: materialized.publicToken,
    publicContentRef: materialized.publicContentRef,
    ...(feedPoster ? { feedPoster } : {}),
    ...videoRefs,
    ...(params.indexingPermissions ? { indexingPermissions: params.indexingPermissions } : {}),
    ...(isUpdate
      ? {
          penPostUpdate: true,
          penPostUpdatedAt: new Date().toISOString()
        }
      : { uploadDate: new Date().toISOString() })
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
