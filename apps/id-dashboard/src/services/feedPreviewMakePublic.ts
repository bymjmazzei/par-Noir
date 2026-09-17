/**
 * Dashboard: resolve plaintext preview blob for make-public (not MIME-only).
 */
import type { FileAggregatorService } from './aggregator/FileAggregatorService';
import {
  publishFeedPreviewsForDashboard,
  type PublishedFeedPreviews,
} from './feedPreviewPublish';

export function visualFeedPreviewKind(meta: {
  fileType?: string;
  name?: string;
  title?: string;
  mimeType?: string;
}): 'image' | 'video' | null {
  const ft = String(meta.fileType || '').toLowerCase();
  const mime = String(meta.mimeType || '').toLowerCase();
  const name = String(meta.name || meta.title || '').toLowerCase();
  if (ft === 'video' || mime.startsWith('video/')) return 'video';
  if (
    ft === 'image' ||
    ft === 'thought-thumbnail' ||
    ft === 'thought-collection' ||
    mime.startsWith('image/') ||
    name.startsWith('thumb_') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)
  ) {
    return 'image';
  }
  return null;
}

function wantsCollectionCover(fileType?: string, collectionFileIds?: string[]): boolean {
  const ft = String(fileType || '').toLowerCase();
  return (
    (ft === 'collection' || ft === 'thought-collection') &&
    Array.isArray(collectionFileIds) &&
    collectionFileIds.length > 0
  );
}

async function downloadDecryptPreviewBlob(params: {
  aggregatorService: FileAggregatorService;
  backendId: string;
  fileId: string;
  encryptionService: {
    decryptFileFromDownload: (
      encJson: unknown,
      session: { id: string; publicKey: string }
    ) => Promise<{ decryptedBlob: Blob }>;
  };
  session: { id: string; publicKey: string };
  encrypted?: boolean;
}): Promise<{ blob: Blob; mimeType: string }> {
  const backend = params.aggregatorService.getBackend(params.backendId);
  if (!backend?.isConnected()) {
    throw new Error('Backend not connected');
  }
  const encBlob = await backend.downloadFile(params.fileId);
  let mimeType = 'application/octet-stream';
  if (params.encrypted !== false) {
    const encJson = JSON.parse(await encBlob.text()) as {
      encrypted?: string;
      iv?: string;
      salt?: string;
      metadata?: { originalMimeType?: string };
    };
    mimeType = encJson.metadata?.originalMimeType || mimeType;
    const { decryptedBlob } = await params.encryptionService.decryptFileFromDownload(encJson, params.session);
    return { blob: decryptedBlob, mimeType };
  }
  return { blob: encBlob, mimeType: encBlob.type || mimeType };
}

/**
 * Publish CDN feed previews for dashboard make-public.
 * Image/video from the file itself; collections from first member cover.
 */
export async function publishFeedPreviewsForDashboardMakePublic(params: {
  aggregatorService: FileAggregatorService;
  backendId: string;
  folderId?: string;
  fileId: string;
  mimeType?: string;
  fileType?: string;
  name?: string;
  title?: string;
  collectionFileIds?: string[];
  encrypted?: boolean;
  encryptionService: {
    decryptFileFromDownload: (
      encJson: unknown,
      session: { id: string; publicKey: string }
    ) => Promise<{ decryptedBlob: Blob }>;
  };
  session: { id: string; publicKey: string };
  planId?: string;
}): Promise<PublishedFeedPreviews | Record<string, never>> {
  const mime = params.mimeType || '';
  const kind = visualFeedPreviewKind({
    fileType: params.fileType,
    name: params.name,
    title: params.title,
    mimeType: mime,
  });
  const useCollectionCover = wantsCollectionCover(params.fileType, params.collectionFileIds);

  let previewSource: Blob | null = null;
  let previewMime = mime;

  if (mime.startsWith('image/') || mime.startsWith('video/') || params.fileType === 'image' || params.fileType === 'video') {
    const decrypted = await downloadDecryptPreviewBlob({
      aggregatorService: params.aggregatorService,
      backendId: params.backendId,
      fileId: params.fileId,
      encryptionService: params.encryptionService,
      session: params.session,
      encrypted: params.encrypted,
    });
    previewSource = decrypted.blob;
    previewMime =
      decrypted.mimeType ||
      mime ||
      (params.fileType === 'video' || mime.startsWith('video/') ? 'video/mp4' : 'image/jpeg');
  } else if (useCollectionCover) {
    const coverId = params.collectionFileIds![0]!;
    const cover = await downloadDecryptPreviewBlob({
      aggregatorService: params.aggregatorService,
      backendId: params.backendId,
      fileId: coverId,
      encryptionService: params.encryptionService,
      session: params.session,
      encrypted: true,
    });
    if (!cover.mimeType.startsWith('image/') && !cover.mimeType.startsWith('video/')) {
      throw new Error('Collection cover is not visual media');
    }
    previewSource = cover.blob;
    previewMime = cover.mimeType;
  } else if (kind === 'image' || kind === 'video') {
    const decrypted = await downloadDecryptPreviewBlob({
      aggregatorService: params.aggregatorService,
      backendId: params.backendId,
      fileId: params.fileId,
      encryptionService: params.encryptionService,
      session: params.session,
      encrypted: params.encrypted,
    });
    previewSource = decrypted.blob;
    previewMime = decrypted.mimeType.startsWith('image/') || decrypted.mimeType.startsWith('video/')
      ? decrypted.mimeType
      : 'image/png';
  }

  if (!previewSource) {
    if (kind || useCollectionCover) {
      throw new Error('Visual public content requires a feed preview source');
    }
    return {};
  }

  return publishFeedPreviewsForDashboard({
    file: previewSource,
    mimeType: previewMime,
    fileId: params.fileId,
    aggregatorService: params.aggregatorService,
    backendId: params.backendId,
    folderId: params.folderId,
    planId: params.planId || 'floor',
  });
}
