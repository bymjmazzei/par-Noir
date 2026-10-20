/**
 * Composed gallery preview on Commit — local IndexedDB + Drive penmedia.
 * Prefer these refs in library thumbs; CDN only on aggregator publish.
 *
 * Docs with a visible video layer MUST encode composed video — no soft skip.
 */

import type { PenDocManifest, PenPagePresentation, PenSectionContent, PenTipTapNode } from '@par-noir/pen-protocol';
import {
  normalizeSection,
  resolveTimelineDuration,
  sectionHasVisibleVideoLayer,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { setPlaybackMode } from './playbackMode';
import { composePageStill, encodePageVideo } from './encodePageVideo';
import {
  rasterizeElementToPosterBlob,
  rasterizeElementSafeStill
} from './rasterizePagePoster';
import { attachMediaFile, penMediaRef, putLocalMedia, uploadStoredMedia } from '@par-noir/pen-media';
import { FEED_PREVIEW_POSTER_MAX_BYTES } from '@par-noir/aggregator-domain';
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

/** Compose capture root for a specific doc section (feed publish / download). */
export function composeExportRootForSlug(slug: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const scoped = document.querySelector(
    `[data-preview-page="${CSS.escape(slug)}"] [data-pen-compose-export-root]`
  );
  if (scoped instanceof HTMLElement) return scoped;
  return findComposeExportRoot();
}

/** Prefer a page-layer root over the feed tile; among those, one that mounts video. */
export function findComposeExportRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const roots = Array.from(
    document.querySelectorAll('[data-pen-compose-export-root]')
  ) as HTMLElement[];
  if (!roots.length) return null;
  const pageRoots = roots.filter((r) => r.getAttribute('data-pen-compose-export-root') === 'page');
  const pool = pageRoots.length ? pageRoots : roots;
  const withVideo = pool.find((r) => r.querySelector('video, [data-pen-media-key]'));
  return withVideo || pool[0] || roots[0] || null;
}

function findComposeRoot(): HTMLElement | null {
  return findComposeExportRoot();
}

const TEMPLATE_POSTER_MAX_EDGE = 720;
const TEMPLATE_POSTER_QUALITIES = [0.82, 0.7, 0.58, 0.46, 0.34];

/**
 * Still of the mounted compose root for a public template's CDN poster.
 * Returns null when nothing fits FEED_PREVIEW_POSTER_MAX_BYTES.
 */
export async function captureTemplatePosterBlob(): Promise<Blob | null> {
  const root = findComposeRoot();
  if (!root) return null;
  for (const raster of [rasterizeElementToPosterBlob, rasterizeElementSafeStill]) {
    for (const quality of TEMPLATE_POSTER_QUALITIES) {
      try {
        const blob = await raster(root, { maxEdge: TEMPLATE_POSTER_MAX_EDGE, quality });
        if (blob.size > 0 && blob.size <= FEED_PREVIEW_POSTER_MAX_BYTES) return blob;
      } catch {
        break;
      }
    }
  }
  return null;
}

/** Upload now; offline, keep it device-only and let the sync job upload it later. */
async function uploadOrLocal(params: {
  blob: Blob;
  docId: string;
  pnIdentifier: string;
}): Promise<{ ref: string; mediaId: string; uploaded: boolean }> {
  try {
    const out = await attachMediaFile({
      pnIdentifier: params.pnIdentifier,
      docId: params.docId,
      file: params.blob
    });
    return { ref: out.ref, mediaId: out.mediaId, uploaded: true };
  } catch {
    const put = await putLocalMedia({ docId: params.docId, blob: params.blob });
    return { ref: put.ref, mediaId: put.mediaId, uploaded: false };
  }
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
  /** The page mounted in the compose root. Its clock drives a motion flatten. */
  clockSection?: PenSectionContent | null;
  pagePresentation?: Pick<PenPagePresentation, 'backgroundVideo'> | null;
}): Promise<GalleryPreviewResult> {
  const needsVideo = docRequiresGalleryVideoCompose(
    params.sections,
    params.pagePresentation
  );

  const root = findComposeRoot();
  if (!root) throw new Error('compose_export_root_missing');

  const pn = params.session.pnIdentifier;
  const docId = params.docId;
  const section = params.clockSection || params.sections[0];
  if (!section) throw new Error('compose_export_root_missing');
  const page = {
    section: normalizeSection(section),
    manifest: { pagePresentation: params.pagePresentation || undefined }
  };

  if (needsVideo) {
    setPlaybackMode('publish');
    let encoded: Awaited<ReturnType<typeof encodePageVideo>>;
    try {
      encoded = await encodePageVideo(root, page);
    } finally {
      setPlaybackMode('edit');
    }
    const video = await uploadOrLocal({
      blob: encoded.sd.blob,
      docId,
      pnIdentifier: pn
    });
    const poster = await uploadOrLocal({
      blob: encoded.poster.blob,
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

  const posterBlob = await composePageStill(root, page);
  const image = await uploadOrLocal({
    blob: posterBlob,
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
}): Promise<string | null> {
  try {
    const fileId = await uploadStoredMedia({
      pnIdentifier: params.session.pnIdentifier,
      docId: params.docId,
      mediaId: params.mediaId
    });
    return fileId ? penMediaRef(fileId) : null;
  } catch {
    return null;
  }
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
