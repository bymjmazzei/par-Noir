/**
 * Turns thumb / preview sources into displayable URLs through the app transport.
 * Every private package goes through `transport.decryptPackage` (one decrypt path for all apps).
 */
import type { OwnerPreviewSource } from './preview';
import { hasFeedPreview } from './publicMedia';
import type { OwnerThumbSource } from './thumb';
import type { EncryptedFilePackage, OwnerFilesTransport, StoredFileRef } from './transport';

export interface OpenedSource {
  url: string;
  mimeType: string;
  /** True when the URL is an object URL created here; the caller must revoke it. */
  revoke: boolean;
  blob?: Blob;
}

export const NOT_AN_ENCRYPTED_PACKAGE = 'Stored file is not an encrypted package';

export class NotAnEncryptedPackageError extends Error {
  constructor() {
    super(NOT_AN_ENCRYPTED_PACKAGE);
    this.name = 'NotAnEncryptedPackageError';
  }
}

export function isEncryptedPackage(value: unknown): value is EncryptedFilePackage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.encrypted === 'string' && typeof v.iv === 'string' && typeof v.salt === 'string';
}

function withType(blob: Blob, mimeType: string | undefined): Blob {
  if (!mimeType || (blob.type && blob.type !== 'application/octet-stream')) return blob;
  return new Blob([blob], { type: mimeType });
}

export async function openStoredBlob(
  transport: OwnerFilesTransport,
  ref: StoredFileRef & { encrypted: boolean; mimeType?: string }
): Promise<Blob> {
  const raw = await transport.downloadFile({
    accountKey: ref.accountKey,
    driveFileId: ref.driveFileId,
    thumbnail: ref.thumbnail
  });
  if (!ref.encrypted) return withType(raw, ref.mimeType);
  let pkg: unknown;
  try {
    pkg = JSON.parse(await raw.text());
  } catch {
    throw new NotAnEncryptedPackageError();
  }
  if (!isEncryptedPackage(pkg)) throw new NotAnEncryptedPackageError();
  const blob = await transport.decryptPackage(pkg);
  return withType(blob, pkg.metadata?.originalMimeType || ref.mimeType);
}

function blobSource(blob: Blob): OpenedSource {
  return { url: URL.createObjectURL(blob), mimeType: blob.type, revoke: true, blob };
}

async function collectionCover(
  transport: OwnerFilesTransport,
  childId: string
): Promise<OpenedSource | null> {
  if (!transport.fetchMetadata) return null;
  const meta = await transport.fetchMetadata(childId).catch(() => null);
  if (!hasFeedPreview(meta)) return null;
  const variant = meta?.feedPoster ? 'poster' : 'sd';
  const url = await transport.resolvePublicMediaUrl(childId, variant);
  return { url, mimeType: variant === 'poster' ? 'image/*' : 'video/*', revoke: false };
}

export async function openThumbSource(
  transport: OwnerFilesTransport,
  source: OwnerThumbSource
): Promise<OpenedSource | null> {
  switch (source.type) {
    case 'cdn': {
      const url = await transport.resolvePublicMediaUrl(source.metadataIndexFileId, source.variant);
      return { url, mimeType: source.variant === 'poster' ? 'image/*' : 'video/*', revoke: false };
    }
    case 'collection-cover':
      return collectionCover(transport, source.childMetadataIndexFileId);
    case 'stored':
      return blobSource(await openStoredBlob(transport, source));
    default:
      return null;
  }
}

export async function openPreviewSource(
  transport: OwnerFilesTransport,
  source: OwnerPreviewSource
): Promise<OpenedSource | null> {
  switch (source.type) {
    case 'cdn': {
      const url = await transport.resolvePublicMediaUrl(source.metadataIndexFileId, source.variant);
      return { url, mimeType: source.media === 'video' ? 'video/*' : 'image/*', revoke: false };
    }
    case 'collection-cover':
      return collectionCover(transport, source.childMetadataIndexFileId);
    case 'stored':
      return blobSource(await openStoredBlob(transport, source));
    default:
      return null;
  }
}

export type PreviewRenderKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'download';

export function previewRenderKind(mimeType: string | undefined): PreviewRenderKind {
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/') || m === 'application/json') return 'text';
  return 'download';
}
