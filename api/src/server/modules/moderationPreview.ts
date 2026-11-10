/**
 * Bytes the publish gates moderate: the public feed preview, never the owner's cloud original.
 * R2 first (platform CDN), then the owner's deliberately public preview URL (anonymous read).
 */
import { isFeedPreviewObjectRef, type FeedPreviewObjectRef } from '@par-noir/aggregator-domain';
import { publicMediaPreviewKind } from './feedPreviewClientRedact';

export type ModerationPreview =
  | { kind: 'image' | 'video'; buffer: Buffer; mimeType: string }
  /** Audio has no visual preview; a human reviews it in Prism. */
  | { kind: 'audio' }
  /** Non-media public content with no preview to screen. */
  | { kind: 'none' };

export interface ModerationPreviewSource {
  fileType?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  feedPoster?: unknown;
  feedPreviewSd?: unknown;
}

function asRef(value: unknown): FeedPreviewObjectRef | null {
  return isFeedPreviewObjectRef(value) ? value : null;
}

function isAudio(meta: ModerationPreviewSource): boolean {
  const ft = String(meta.fileType || '').toLowerCase();
  const mime = String(meta.mimeType || '').toLowerCase();
  return ft === 'audio' || mime.startsWith('audio/');
}

async function readPreviewBytes(ref: FeedPreviewObjectRef): Promise<Buffer> {
  if (ref.r2Key) {
    const { feedR2GetBytes } = await import('./feedPreviewR2');
    const bytes = await feedR2GetBytes(ref.r2Key);
    if (bytes && bytes.length > 0) return bytes;
  }
  if (ref.ownerPublicUrl) {
    const { fetchPublicBytesTimed } = await import('./publicBlobAccess');
    const { buffer } = await fetchPublicBytesTimed({
      backend: (ref.ownerBackend || 'google_drive') as any,
      objectId: ref.ownerObjectId || '',
      publicUrl: ref.ownerPublicUrl,
    });
    return buffer;
  }
  throw new Error('Public preview is not readable (no R2 object and no public URL)');
}

/** Throws when a preview ref exists but its bytes cannot be read; gates apply their fail mode. */
export async function loadModerationPreview(meta: ModerationPreviewSource): Promise<ModerationPreview> {
  const poster = asRef(meta.feedPoster);
  const sd = asRef(meta.feedPreviewSd);
  const kind = publicMediaPreviewKind(meta);

  if (kind === 'video' && sd) {
    return { kind: 'video', buffer: await readPreviewBytes(sd), mimeType: sd.contentType || 'video/mp4' };
  }
  const imageRef = kind === 'video' ? poster : poster || sd;
  if (imageRef) {
    return {
      kind: 'image',
      buffer: await readPreviewBytes(imageRef),
      mimeType: imageRef.contentType || 'image/jpeg',
    };
  }
  if (isAudio(meta)) return { kind: 'audio' };
  if (kind) {
    throw new Error(`Public ${kind} has no feed preview to moderate`);
  }
  return { kind: 'none' };
}
