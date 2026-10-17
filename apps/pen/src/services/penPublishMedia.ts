/**
 * Resolve layer media bytes before feed compose (masters + proxy fallback).
 */

import {
  editorPlaybackSrc,
  publishPlaybackSrc,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { downloadCloudMediaBlob } from './penAttach';
import {
  isPenMediaRef,
  isPenMediaSrcRef,
  parsePenMediaFileId,
  putLocalMediaForDriveFile,
  resolvePenMediaSrc
} from './penLocalMedia';
import type { PenSession } from './penSession';

async function hydratePenMediaRef(
  ref: string,
  session: PenSession,
  docId: string
): Promise<void> {
  if (!isPenMediaRef(ref)) return;
  const existing = await resolvePenMediaSrc(ref, docId);
  if (existing) return;
  const fileId = parsePenMediaFileId(ref);
  if (!fileId) return;
  const { blob } = await downloadCloudMediaBlob(fileId, session.pnIdentifier, docId);
  await putLocalMediaForDriveFile({ docId, fileId, blob });
}

async function copyFallbackBytesToPenMediaMaster(
  primary: string,
  altUrl: string,
  docId: string
): Promise<boolean> {
  if (!isPenMediaRef(primary)) return false;
  const fileId = parsePenMediaFileId(primary);
  if (!fileId) return false;
  const res = await fetch(altUrl);
  if (!res.ok) return false;
  const blob = await res.blob();
  await putLocalMediaForDriveFile({ docId, fileId, blob });
  return true;
}

async function ensureRefResolvable(
  ref: string | undefined,
  fallbackRef: string | undefined,
  session: PenSession,
  docId: string
): Promise<void> {
  const primary = ref?.trim();
  if (!primary) return;
  if (!isPenMediaSrcRef(primary)) return;

  const cachedPrimary = await resolvePenMediaSrc(primary, docId);
  if (cachedPrimary) return;

  const alt = fallbackRef?.trim();
  if (alt && alt !== primary && isPenMediaSrcRef(alt)) {
    let altUrl = await resolvePenMediaSrc(alt, docId);
    if (!altUrl) {
      try {
        await hydratePenMediaRef(alt, session, docId);
        altUrl = await resolvePenMediaSrc(alt, docId);
      } catch {
        altUrl = null;
      }
    }
    if (altUrl && (await copyFallbackBytesToPenMediaMaster(primary, altUrl, docId))) {
      return;
    }
  }

  try {
    await hydratePenMediaRef(primary, session, docId);
    const url = await resolvePenMediaSrc(primary, docId);
    if (url) return;
  } catch {
    /* fall through */
  }

  if (!alt || alt === primary || !isPenMediaSrcRef(alt)) {
    throw new Error('publish_media_missing');
  }
  const altUrl = await resolvePenMediaSrc(alt, docId);
  if (altUrl && (await copyFallbackBytesToPenMediaMaster(primary, altUrl, docId))) {
    return;
  }
  try {
    await hydratePenMediaRef(alt, session, docId);
  } catch {
    throw new Error('cloud_download_failed');
  }
  const again = await resolvePenMediaSrc(primary, docId);
  if (!again) throw new Error('publish_media_missing');
}

function layerPublishRefs(layer: PenPageLayer): {
  master?: string;
  editor?: string;
} {
  const master = publishPlaybackSrc(layer);
  const editor = editorPlaybackSrc(layer);
  return { master, editor };
}

/** Ensure publish masters are in local cache before on-device video compose. */
export async function ensurePublishPlaybackBytes(params: {
  session: PenSession;
  docId: string;
  sections: PenSectionContent[];
  pagePresentation?: PenPagePresentation;
}): Promise<void> {
  for (const section of params.sections) {
    for (const layer of section.layers || []) {
      const { master, editor } = layerPublishRefs(layer);
      await ensureRefResolvable(master, editor, params.session, params.docId);
      if (layer.paintOverlaySrc?.trim()) {
        await ensureRefResolvable(layer.paintOverlaySrc, undefined, params.session, params.docId);
      }
    }
  }
  const pres = params.pagePresentation;
  if (pres?.backgroundVideo?.trim()) {
    await ensureRefResolvable(
      publishPlaybackSrc({ backgroundVideo: pres.backgroundVideo }),
      editorPlaybackSrc({ backgroundVideo: pres.backgroundVideo, editProxySrc: pres.editProxySrc }),
      params.session,
      params.docId
    );
  }
  if (pres?.backgroundImage?.trim() && isPenMediaSrcRef(pres.backgroundImage)) {
    await ensureRefResolvable(pres.backgroundImage, undefined, params.session, params.docId);
  }
}
