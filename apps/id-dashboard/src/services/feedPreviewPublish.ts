/**
 * Dashboard: encode feed previews, R2 presign PUT, owner-cloud canonical, confirm.
 */
import type { FeedPreviewObjectRef, PublishTierId } from '@par-noir/aggregator-domain';
import {
  ensurePublicContentRef,
  getPublishTier,
  r2ObjectKey,
} from '@par-noir/aggregator-domain';
import { encodeFeedPreviewsForPublish, type EncodedPreview } from './feedPreviewEncode';
import { API_ENDPOINT } from '../config/api';
import { resolveOwnerApiToken } from './ownerApiToken';
import { getOwnerApiPnIdentifier, ownerFetch } from './ownerApiService';
import type { FileAggregatorService } from './aggregator/FileAggregatorService';

export type PublishedFeedPreviews = {
  feedPoster: FeedPreviewObjectRef;
  feedPreviewSd?: FeedPreviewObjectRef;
  feedPreviewHd?: FeedPreviewObjectRef;
};

export async function publishFeedPreviewsForDashboard(params: {
  file: File | Blob;
  mimeType: string;
  fileId: string;
  aggregatorService: FileAggregatorService;
  backendId: string;
  folderId?: string;
  planId?: PublishTierId | string;
  onProgress?: (msg: string) => void;
}): Promise<PublishedFeedPreviews> {
  const ownerToken = resolveOwnerApiToken();
  if (!ownerToken) throw new Error('par Noir API session not ready');
  const pnIdentifier = getOwnerApiPnIdentifier();
  if (!pnIdentifier) throw new Error('Unlock your pN to publish feed previews');

  const planId = params.planId || 'floor';
  const tier = getPublishTier(planId);
  params.onProgress?.('Preparing feed preview…');
  const encoded = await encodeFeedPreviewsForPublish(params.file, params.mimeType, tier);

  const out: PublishedFeedPreviews = {
    feedPoster: await uploadOne({
      ...params,
      ownerToken,
      pnIdentifier,
      planId,
      encoded: encoded.poster,
    }),
  };
  if (encoded.sd) {
    out.feedPreviewSd = await uploadOne({
      ...params,
      ownerToken,
      pnIdentifier,
      planId,
      encoded: encoded.sd,
    });
  }
  if (encoded.hd) {
    out.feedPreviewHd = await uploadOne({
      ...params,
      ownerToken,
      pnIdentifier,
      planId,
      encoded: encoded.hd,
    });
  }
  return out;
}

async function uploadOne(params: {
  fileId: string;
  ownerToken: string;
  pnIdentifier: string;
  planId: string;
  aggregatorService: FileAggregatorService;
  backendId: string;
  folderId?: string;
  encoded: EncodedPreview;
}): Promise<FeedPreviewObjectRef> {
  const { encoded, fileId, ownerToken, planId, pnIdentifier } = params;
  const presignRes = await ownerFetch(ownerToken, 'POST', '/api/aggregator/feed-media/presign-upload', {
    fileId,
    variant: encoded.variant,
    contentType: encoded.contentType,
    contentLength: encoded.byteSize,
    planId,
  }, { pnIdentifier });
  if (!presignRes.ok) {
    throw new Error(`presign_failed_${presignRes.status}`);
  }
  const presign = (await presignRes.json()) as { url: string; key: string };
  const putRes = await fetch(presign.url, {
    method: 'PUT',
    headers: { 'Content-Type': encoded.contentType },
    body: encoded.blob,
  });
  if (!putRes.ok) throw new Error(`r2_put_failed_${putRes.status}`);

  const FileConstructor = globalThis.File || window.File;
  const file = new FileConstructor(
    [encoded.blob],
    `feed-preview-${fileId}-${encoded.variant}`,
    { type: encoded.contentType }
  );
  const uploaded = await params.aggregatorService.uploadToBackend(
    params.backendId,
    file,
    params.folderId
  );
  const objectId = uploaded.id || (uploaded as { backendFileId?: string }).backendFileId;
  if (!objectId) throw new Error('canonical_upload_missing_id');

  const publicContentRef = await ensurePublicContentRef({
    objectId,
    backend: 'google_drive',
    apiBase: API_ENDPOINT,
    headers: { Authorization: `Bearer ${ownerToken}` },
  });

  const ref: FeedPreviewObjectRef = {
    r2Key: presign.key || r2ObjectKey(fileId, encoded.variant),
    ownerObjectId: publicContentRef.objectId,
    ownerBackend: publicContentRef.backend,
    ownerPublicUrl: publicContentRef.publicUrl,
    contentType: encoded.contentType,
    byteSize: encoded.byteSize,
    width: encoded.width,
    height: encoded.height,
    durationMs: encoded.durationMs,
    r2Warm: true,
    lastPlayedAt: new Date().toISOString(),
  };

  const confirmRes = await ownerFetch(
    ownerToken,
    'POST',
    '/api/aggregator/feed-media/confirm-upload',
    { fileId, variant: encoded.variant, ref },
    { pnIdentifier }
  );
  if (!confirmRes.ok) throw new Error(`confirm_failed_${confirmRes.status}`);
  return ref;
}
