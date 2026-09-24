/**
 * Composed gallery preview on Commit — local IndexedDB + Drive penmedia.
 * Prefer these refs in library thumbs; CDN only on aggregator publish.
 *
 * Docs with a visible video layer MUST encode composed video — no soft skip.
 */

import type { PenDocManifest, PenPagePresentation, PenSectionContent, PenTipTapNode } from '@par-noir/pen-protocol';
import {
  normalizeSection,
  sectionHasVisibleVideoLayer,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import {
  composePageToVideo,
  collectUntaintedVideoSlots,
  rootHasUntaintedPlayableVideo
} from './composePageVideoEncode';
import {
  rasterizeElementToPosterBlob,
  rasterizeElementSafeStill
} from './rasterizePagePoster';
import { uploadBytesAsPenMedia } from './penAttach';
import {
  getLocalMedia,
  putLocalMedia,
  putLocalMediaForDriveFile,
  penMediaRef,
  resolveLocalMediaUrl
} from './penLocalMedia';
import type { PenSession } from './penSession';

export type GalleryMedia = { src: string; kind: 'image' | 'video' };

export type GalleryPreviewResult = {
  galleryPreviewRef: string;
  galleryPreviewKind: 'image' | 'video';
  galleryPreviewPosterRef?: string;
  galleryPreviewCommitHash: string;
  /** True when Drive upload produced penmedia: refs (vs penlocal-only). */
  uploaded: boolean;
  localMediaId: string;
  posterLocalMediaId?: string;
};

function sectionMap(sections: PenSectionContent[]): Map<string, PenSectionContent> {
  return new Map(
    sections.map((s) => {
      const n = normalizeSection(s);
      return [n.slug, n];
    })
  );
}

function firstImageSrc(doc: PenTipTapNode | undefined): string | null {
  if (!doc) return null;
  const walk = (n: PenTipTapNode): string | null => {
    if (n.type === 'image' && n.attrs?.src) return String(n.attrs.src);
    for (const c of n.content || []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(doc);
}

function layerHasBackgroundVideo(layer: PenPageLayer): boolean {
  return Boolean(layer.visible !== false && layer.backgroundVideo?.trim());
}

/**
 * True when Commit must produce a composed gallery *video* (IR has video layer
 * or page/layer background video). Pure — safe for gate tests.
 */
export function docRequiresGalleryVideoCompose(
  sections: PenSectionContent[] | null | undefined,
  pagePresentation?: Pick<PenPagePresentation, 'backgroundVideo'> | null
): boolean {
  if (pagePresentation?.backgroundVideo?.trim()) return true;
  for (const raw of sections || []) {
    const sec = normalizeSection(raw);
    if (sectionHasVisibleVideoLayer(sec)) return true;
    if ((sec.layers || []).some(layerHasBackgroundVideo)) return true;
  }
  return false;
}

function firstLayerMedia(sections: PenSectionContent[]): GalleryMedia | null {
  for (const raw of sections) {
    const sec = normalizeSection(raw);
    const visible = (sec.layers || []).filter((l) => l.visible !== false);
    const video = visible.find((l) => l.kind === 'video' && l.videoSrc);
    if (video?.videoSrc) return { src: video.videoSrc, kind: 'video' };
    const image = visible.find((l) => l.kind === 'image' && l.imageSrc);
    if (image?.imageSrc) return { src: image.imageSrc, kind: 'image' };
    const bgVideo = visible.find((l) => l.backgroundVideo);
    if (bgVideo?.backgroundVideo) {
      return { src: bgVideo.backgroundVideo, kind: 'video' };
    }
    const bgImage = visible.find((l) => l.backgroundImage);
    if (bgImage?.backgroundImage) {
      return { src: bgImage.backgroundImage, kind: 'image' };
    }
  }
  return null;
}

function resolveLayerMedia(
  sections: PenSectionContent[],
  pagePresentation?: PenPagePresentation | null
): GalleryMedia | null {
  const fromLayers = firstLayerMedia(sections);
  if (fromLayers) return fromLayers;
  if (pagePresentation?.backgroundVideo) {
    return { src: pagePresentation.backgroundVideo, kind: 'video' };
  }
  if (pagePresentation?.backgroundImage) {
    return { src: pagePresentation.backgroundImage, kind: 'image' };
  }
  const bySlug = sectionMap(sections);
  for (const slug of ['attachments', 'media', 'cover', 'body', 'pages', 'front']) {
    const src = firstImageSrc(bySlug.get(slug)?.doc);
    if (src) return { src, kind: 'image' };
  }
  for (const sec of sections) {
    const src = firstImageSrc(normalizeSection(sec).doc);
    if (src) return { src, kind: 'image' };
  }
  return null;
}

/**
 * Prefer committed composed gallery preview over live layer media.
 * Pure — safe for gate tests.
 */
export function resolveGalleryMedia(
  manifest: Pick<
    PenDocManifest,
    | 'galleryPreviewRef'
    | 'galleryPreviewKind'
    | 'galleryPreviewPosterRef'
    | 'pagePresentation'
  >,
  sections: PenSectionContent[]
): GalleryMedia | null {
  if (manifest.galleryPreviewRef) {
    return {
      src: manifest.galleryPreviewRef,
      kind: manifest.galleryPreviewKind === 'video' ? 'video' : 'image'
    };
  }
  return resolveLayerMedia(sections, manifest.pagePresentation);
}

/**
 * Prefer page-layer compose root (flattened layers) over feed tile; among
 * those, prefer a root that already has untainted playable video.
 */
export function findComposeExportRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const roots = Array.from(
    document.querySelectorAll('[data-pen-compose-export-root]')
  ) as HTMLElement[];
  if (!roots.length) return null;
  const pageRoots = roots.filter((r) => r.getAttribute('data-pen-compose-export-root') === 'page');
  const pool = pageRoots.length ? pageRoots : roots;
  const withVideo = pool.find((r) => rootHasUntaintedPlayableVideo(r));
  return withVideo || pool[0] || roots[0] || null;
}

function findComposeRoot(): HTMLElement | null {
  return findComposeExportRoot();
}

async function uploadOrLocal(params: {
  blob: Blob;
  fileName: string;
  docId: string;
  pnIdentifier: string;
}): Promise<{ ref: string; mediaId: string; uploaded: boolean }> {
  const put = await putLocalMedia({ docId: params.docId, blob: params.blob });
  try {
    const fileId = await uploadBytesAsPenMedia({
      blob: params.blob,
      fileName: params.fileName,
      pnIdentifier: params.pnIdentifier,
      docId: params.docId
    });
    if (fileId) {
      await putLocalMediaForDriveFile({
        docId: params.docId,
        fileId,
        blob: params.blob
      });
      return { ref: penMediaRef(fileId), mediaId: put.mediaId, uploaded: true };
    }
  } catch {
    /* offline / token — keep penlocal */
  }
  return { ref: put.ref, mediaId: put.mediaId, uploaded: false };
}

const VIDEO_HYDRATE_TIMEOUT_MS = 20_000;
const VIDEO_HYDRATE_POLL_MS = 200;

export async function waitForUntaintedComposeVideos(
  initialRoot: HTMLElement,
  timeoutMs = VIDEO_HYDRATE_TIMEOUT_MS
): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs;
  let root = initialRoot;
  while (Date.now() < deadline) {
    root = findComposeRoot() || root;
    if (collectUntaintedVideoSlots(root).length > 0) return root;
    await new Promise((r) => setTimeout(r, VIDEO_HYDRATE_POLL_MS));
  }
  throw new Error('gallery_video_not_ready');
}

/**
 * Compose page → local cache → Drive penmedia.
 * When `sections` include a video layer, encode composed video or throw
 * (Commit must not soft-skip video gallery).
 */
export async function buildAndStoreGalleryPreview(params: {
  session: PenSession;
  docId: string;
  commitHash: string;
  sections: PenSectionContent[];
  pagePresentation?: Pick<PenPagePresentation, 'backgroundVideo'> | null;
}): Promise<GalleryPreviewResult> {
  const needsVideo = docRequiresGalleryVideoCompose(
    params.sections,
    params.pagePresentation
  );

  let root = findComposeRoot();
  if (!root) throw new Error('compose_export_root_missing');

  const pn = params.session.pnIdentifier;
  const docId = params.docId;

  if (needsVideo) {
    root = await waitForUntaintedComposeVideos(root);
    const encoded = await composePageToVideo(root);
    const video = await uploadOrLocal({
      blob: encoded.videoBlob,
      fileName: 'gallery-preview.penmedia',
      docId,
      pnIdentifier: pn
    });
    const poster = await uploadOrLocal({
      blob: encoded.posterBlob,
      fileName: 'gallery-preview-poster.penmedia',
      docId,
      pnIdentifier: pn
    });
    return {
      galleryPreviewRef: video.ref,
      galleryPreviewKind: 'video',
      galleryPreviewPosterRef: poster.ref,
      galleryPreviewCommitHash: params.commitHash,
      uploaded: video.uploaded && poster.uploaded,
      localMediaId: video.mediaId,
      posterLocalMediaId: poster.mediaId
    };
  }

  // Still path — prefer foreignObject rasterize; fall back to safe still (no taint).
  let posterBlob: Blob;
  try {
    posterBlob = await rasterizeElementToPosterBlob(root);
  } catch {
    posterBlob = await rasterizeElementSafeStill(root);
  }
  const image = await uploadOrLocal({
    blob: posterBlob,
    fileName: 'gallery-preview.penmedia',
    docId,
    pnIdentifier: pn
  });
  return {
    galleryPreviewRef: image.ref,
    galleryPreviewKind: 'image',
    galleryPreviewCommitHash: params.commitHash,
    uploaded: image.uploaded,
    localMediaId: image.mediaId
  };
}

/** Upload a previously cached local gallery blob to Drive; return penmedia ref. */
export async function uploadLocalGalleryBlob(params: {
  session: PenSession;
  docId: string;
  mediaId: string;
  fileName: string;
}): Promise<string | null> {
  const hit = await getLocalMedia(params.mediaId);
  if (!hit) return null;
  const blob = new Blob([hit.bytes], { type: hit.mime });
  const fileId = await uploadBytesAsPenMedia({
    blob,
    fileName: params.fileName,
    pnIdentifier: params.session.pnIdentifier,
    docId: params.docId
  });
  if (!fileId) return null;
  await putLocalMediaForDriveFile({
    docId: params.docId,
    fileId,
    blob
  });
  return penMediaRef(fileId);
}

export async function ensureLocalGalleryBlobUrl(mediaId: string): Promise<string | null> {
  return resolveLocalMediaUrl(mediaId);
}

/** Apply preview fields onto a manifest. */
export function withGalleryPreview(
  manifest: PenDocManifest,
  preview: Pick<
    GalleryPreviewResult,
    | 'galleryPreviewRef'
    | 'galleryPreviewKind'
    | 'galleryPreviewPosterRef'
    | 'galleryPreviewCommitHash'
  >
): PenDocManifest {
  return {
    ...manifest,
    galleryPreviewRef: preview.galleryPreviewRef,
    galleryPreviewKind: preview.galleryPreviewKind,
    galleryPreviewPosterRef: preview.galleryPreviewPosterRef,
    galleryPreviewCommitHash: preview.galleryPreviewCommitHash,
    updatedAt: new Date().toISOString()
  };
}
