/**
 * Resolve a plaintext preview blob for make-public / collection publish paths.
 * Visual public media must attach CDN feed previews (not MIME-only).
 */
import { ownerGet } from './ownerApiFetch';
import { publishFeedPreviews, type PublishedFeedPreviews } from './feedPreviewPublish';

export interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
  };
}

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

async function decryptPackageToBlob(
  encryptedPackage: EncryptedFilePackage,
  session: { did: string; publicKey: string }
): Promise<Blob> {
  const { EncryptionManager } = await import('@par-noir/identity-crypto/browser');
  const encryptionManager = new EncryptionManager();
  const decrypted = await encryptionManager.decrypt(
    encryptedPackage.encrypted,
    encryptedPackage.iv,
    encryptedPackage.salt,
    session.did,
    session.publicKey
  );
  const arrayBuffer = decrypted.buffer.slice(
    decrypted.byteOffset,
    decrypted.byteOffset + decrypted.byteLength
  ) as ArrayBuffer;
  const mime = encryptedPackage.metadata?.originalMimeType || 'application/octet-stream';
  return new Blob([arrayBuffer], { type: mime });
}

async function downloadEncryptedPackage(
  fileId: string,
  accountId: string,
  accessToken: string
): Promise<EncryptedFilePackage> {
  const downloadResponse = await ownerGet(
    `/api/drive/files/${fileId}?accountId=${encodeURIComponent(accountId)}&download=true`,
    { authToken: accessToken }
  );
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download preview source: ${downloadResponse.status}`);
  }
  const fileText = await downloadResponse.text();
  if (!fileText?.trim()) {
    throw new Error('Downloaded preview source is empty');
  }
  const encryptedPackage = JSON.parse(fileText) as EncryptedFilePackage;
  if (!encryptedPackage.encrypted || !encryptedPackage.iv || !encryptedPackage.salt) {
    throw new Error('Invalid encrypted preview source package');
  }
  return encryptedPackage;
}

/**
 * Build CDN feed preview fields for a file being made public.
 * Uses decrypted MIME when image/video; otherwise first collection member / cover thumb.
 */
export async function publishFeedPreviewsForPublicVisual(params: {
  encryptedPackage: EncryptedFilePackage;
  fileId: string;
  accessToken: string;
  accountId: string;
  session: { did: string; publicKey: string };
  fileType?: string;
  name?: string;
  title?: string;
  collectionFileIds?: string[];
  planId?: string;
}): Promise<PublishedFeedPreviews | Record<string, never>> {
  const mime = params.encryptedPackage.metadata?.originalMimeType || '';
  const kind = visualFeedPreviewKind({
    fileType: params.fileType,
    name: params.name,
    title: params.title,
    mimeType: mime,
  });
  const useCollectionCover = wantsCollectionCover(params.fileType, params.collectionFileIds);

  let previewBlob: Blob | null = null;
  let previewMime = mime;

  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    previewBlob = await decryptPackageToBlob(params.encryptedPackage, params.session);
    previewMime = mime;
  } else if (useCollectionCover) {
    const coverId = params.collectionFileIds![0]!;
    const coverPkg = await downloadEncryptedPackage(coverId, params.accountId, params.accessToken);
    const coverMime = coverPkg.metadata?.originalMimeType || 'image/jpeg';
    if (!coverMime.startsWith('image/') && !coverMime.startsWith('video/')) {
      throw new Error('Collection cover is not visual media');
    }
    previewBlob = await decryptPackageToBlob(coverPkg, params.session);
    previewMime = coverMime;
  } else if (kind === 'image' || kind === 'video') {
    // Thought / thumb fileType but unexpected MIME — still try decrypt as image
    previewBlob = await decryptPackageToBlob(params.encryptedPackage, params.session);
    previewMime = mime.startsWith('image/') || mime.startsWith('video/') ? mime : 'image/png';
  }

  if (!previewBlob) {
    if (kind || useCollectionCover) {
      throw new Error('Visual public content requires a feed preview source');
    }
    return {};
  }

  return publishFeedPreviews({
    file: previewBlob,
    mimeType: previewMime,
    fileId: params.fileId,
    accessToken: params.accessToken,
    accountId: params.accountId,
    planId: params.planId || 'floor',
  });
}
