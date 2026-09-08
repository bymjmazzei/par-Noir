/**
 * Publish feed previews: encode → R2 presign PUT → owner-cloud canonical → confirm.
 */
import type { FeedPreviewObjectRef, PublishTierId } from '@par-noir/aggregator-domain';
import { getPublishTier, r2ObjectKey } from '@par-noir/aggregator-domain';
import { encodeFeedPreviewsForPublish, type EncodedPreview } from './feedPreviewEncode';
import { uploadStorageFile } from './storageApiClient';
import { ownerApiHeadersAsync } from './ownerApiHeaders';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1]! : result);
    };
    reader.onerror = () => reject(new Error('Failed to read preview blob'));
    reader.readAsDataURL(blob);
  });
}

async function putPresigned(url: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`r2_put_failed_${res.status}`);
  }
}

async function ensureOwnerCanonical(
  blob: Blob,
  fileName: string,
  accessToken: string,
  accountId: string,
  mimeType: string,
  pnIdentifier: string
): Promise<{ objectId: string; publicUrl: string; backend: string }> {
  const base64 = await blobToBase64(blob);
  const uploaded = await uploadStorageFile(accessToken, pnIdentifier, 'google_drive', {
    fileData: base64,
    fileName,
    mimeType,
    accountId,
    encrypt: false,
  });
  const headers = await ownerApiHeadersAsync(accessToken);
  const ensureRes = await fetch(
    `${API_ENDPOINT}/api/aggregator/public-content/${encodeURIComponent(uploaded.id)}/ensure-public`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend: uploaded.backend || 'google_drive' }),
    }
  );
  if (!ensureRes.ok) {
    throw new Error(`ensure_public_canonical_failed_${ensureRes.status}`);
  }
  const data = (await ensureRes.json()) as {
    publicContentRef?: { objectId: string; publicUrl: string; backend: string };
  };
  if (!data.publicContentRef?.publicUrl) {
    throw new Error('ensure_public_canonical_missing_ref');
  }
  return {
    objectId: data.publicContentRef.objectId,
    publicUrl: data.publicContentRef.publicUrl,
    backend: data.publicContentRef.backend,
  };
}

export type PublishedFeedPreviews = {
  feedPoster: FeedPreviewObjectRef;
  feedPreviewSd?: FeedPreviewObjectRef;
  feedPreviewHd?: FeedPreviewObjectRef;
};

export async function publishFeedPreviews(params: {
  file: File | Blob;
  mimeType: string;
  fileId: string;
  accessToken: string;
  accountId: string;
  planId?: PublishTierId | string;
  onProgress?: (msg: string) => void;
}): Promise<PublishedFeedPreviews> {
  const session = PNOAuthService.loadSession();
  const pnIdentifier = session?.pnIdentifier;
  if (!pnIdentifier) {
    throw new Error('Unlock your pN to publish feed previews');
  }
  const planId = params.planId || 'floor';
  const tier = getPublishTier(planId);
  params.onProgress?.('Preparing feed preview…');
  const encoded = await encodeFeedPreviewsForPublish(params.file, params.mimeType, tier);

  const out: PublishedFeedPreviews = {
    feedPoster: await uploadOneVariant({
      ...params,
      planId,
      pnIdentifier,
      encoded: encoded.poster,
    }),
  };
  if (encoded.sd) {
    out.feedPreviewSd = await uploadOneVariant({
      ...params,
      planId,
      pnIdentifier,
      encoded: encoded.sd,
    });
  }
  if (encoded.hd) {
    out.feedPreviewHd = await uploadOneVariant({
      ...params,
      planId,
      pnIdentifier,
      encoded: encoded.hd,
    });
  }
  return out;
}

async function uploadOneVariant(params: {
  fileId: string;
  accessToken: string;
  accountId: string;
  planId: string;
  pnIdentifier: string;
  encoded: EncodedPreview;
}): Promise<FeedPreviewObjectRef> {
  const { encoded, fileId, accessToken, accountId, planId, pnIdentifier } = params;
  const headers = await ownerApiHeadersAsync(accessToken);
  const presignRes = await fetch(`${API_ENDPOINT}/api/aggregator/feed-media/presign-upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId,
      variant: encoded.variant,
      contentType: encoded.contentType,
      contentLength: encoded.byteSize,
      planId,
    }),
  });
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `presign_failed_${presignRes.status}`);
  }
  const presign = (await presignRes.json()) as { url: string; key: string };
  await putPresigned(presign.url, encoded.blob, encoded.contentType);

  const canonical = await ensureOwnerCanonical(
    encoded.blob,
    `feed-preview-${fileId}-${encoded.variant}`,
    accessToken,
    accountId,
    encoded.contentType,
    pnIdentifier
  );

  const ref: FeedPreviewObjectRef = {
    r2Key: presign.key || r2ObjectKey(fileId, encoded.variant),
    ownerObjectId: canonical.objectId,
    ownerBackend: canonical.backend,
    ownerPublicUrl: canonical.publicUrl,
    contentType: encoded.contentType,
    byteSize: encoded.byteSize,
    width: encoded.width,
    height: encoded.height,
    durationMs: encoded.durationMs,
    r2Warm: true,
    lastPlayedAt: new Date().toISOString(),
  };

  const confirmRes = await fetch(`${API_ENDPOINT}/api/aggregator/feed-media/confirm-upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId,
      variant: encoded.variant,
      ref,
    }),
  });
  if (!confirmRes.ok) {
    throw new Error(`confirm_upload_failed_${confirmRes.status}`);
  }
  return ref;
}
