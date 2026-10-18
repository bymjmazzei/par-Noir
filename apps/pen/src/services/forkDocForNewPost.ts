/**
 * Fork a published Pen doc into a separate doc before Share as new post.
 * New docId / docKey / media so custody and engagement never collide with the original.
 */

import {
  getTemplate,
  requireTemplate,
  stripPollSpreadsheetFromSection,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import {
  attachMediaFile,
  downloadPenMedia,
  isPenLocalMediaRef,
  isPenMediaRef,
  MEDIA_SRC_FIELDS,
  parsePenMediaFileId,
  PRESENTATION_MEDIA_FIELDS,
  resolvePenMediaSrc
} from '@par-noir/pen-media';
import type { PenSession } from './penSession';
import { saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { bootstrapDocBundle, randomPenDocId } from './createDocFromTemplate';

async function blobForMediaRef(params: {
  src: string;
  sourceDocId: string;
  pnIdentifier: string;
}): Promise<Blob | null> {
  const { src, sourceDocId, pnIdentifier } = params;
  if (isPenMediaRef(src)) {
    const fileId = parsePenMediaFileId(src);
    if (!fileId) return null;
    try {
      return await downloadPenMedia({ pnIdentifier, docId: sourceDocId, fileId });
    } catch {
      return null;
    }
  }
  if (isPenLocalMediaRef(src)) {
    const url = await resolvePenMediaSrc(src);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }
  return null;
}

async function remapMediaRef(params: {
  src: string | undefined;
  sourceDocId: string;
  forkDocId: string;
  pnIdentifier: string;
  cache: Map<string, string>;
}): Promise<string | undefined> {
  const { src, sourceDocId, forkDocId, pnIdentifier, cache } = params;
  if (!src || (!isPenMediaRef(src) && !isPenLocalMediaRef(src))) return src;
  const hit = cache.get(src);
  if (hit) return hit;
  const blob = await blobForMediaRef({ src, sourceDocId, pnIdentifier });
  if (!blob) return src;
  const attached = await attachMediaFile({
    pnIdentifier,
    docId: forkDocId,
    file: blob
  });
  cache.set(src, attached.ref);
  return attached.ref;
}

async function remapSectionsMedia(params: {
  sections: PenSectionContent[];
  sourceDocId: string;
  forkDocId: string;
  pnIdentifier: string;
  cache: Map<string, string>;
}): Promise<PenSectionContent[]> {
  const out: PenSectionContent[] = [];
  for (const section of params.sections) {
    const stripped = stripPollSpreadsheetFromSection(section);
    const layers = [];
    for (const layer of stripped.layers || []) {
      const next = { ...layer } as Record<string, unknown>;
      for (const field of MEDIA_SRC_FIELDS) {
        if (typeof next[field] === 'string') {
          next[field] = await remapMediaRef({
            src: next[field] as string,
            sourceDocId: params.sourceDocId,
            forkDocId: params.forkDocId,
            pnIdentifier: params.pnIdentifier,
            cache: params.cache
          });
        }
      }
      if (Array.isArray(next.audioTracks)) {
        next.audioTracks = await Promise.all(
          (next.audioTracks as Array<{ src?: string }>).map(async (track) => ({
            ...track,
            src: await remapMediaRef({
              src: track.src,
              sourceDocId: params.sourceDocId,
              forkDocId: params.forkDocId,
              pnIdentifier: params.pnIdentifier,
              cache: params.cache
            })
          }))
        );
      }
      layers.push(next);
    }
    out.push({ ...stripped, layers: layers as PenSectionContent['layers'] });
  }
  return out;
}

/** Create a separate Pen doc copied from `source`, ready to publish as a new post. */
export async function forkDocForNewPost(params: {
  session: PenSession;
  source: LocalDocBundle;
}): Promise<LocalDocBundle> {
  const { session, source } = params;
  const forkDocId = randomPenDocId();
  const template =
    getTemplate(source.manifest.templateId) ||
    requireTemplate(source.manifest.templateId);
  const cache = new Map<string, string>();
  const sections = await remapSectionsMedia({
    sections: source.sections,
    sourceDocId: source.manifest.docId,
    forkDocId,
    pnIdentifier: session.pnIdentifier,
    cache
  });

  let pagePresentation = source.manifest.pagePresentation
    ? { ...source.manifest.pagePresentation }
    : undefined;
  if (pagePresentation) {
    for (const field of PRESENTATION_MEDIA_FIELDS) {
      const cur = pagePresentation[field];
      if (typeof cur === 'string') {
        pagePresentation = {
          ...pagePresentation,
          [field]: await remapMediaRef({
            src: cur,
            sourceDocId: source.manifest.docId,
            forkDocId,
            pnIdentifier: session.pnIdentifier,
            cache
          })
        };
      }
    }
  }

  const bundle = await bootstrapDocBundle({
    session,
    template,
    docId: forkDocId,
    sections,
    title: source.manifest.title,
    classId: source.manifest.classId,
    docType: source.manifest.docType,
    toc: source.manifest.toc,
    pageLayout: source.manifest.pageLayout,
    pageView: source.manifest.pageView,
    pagePresentation,
    galleryAspect: source.manifest.galleryAspect,
    pageSwipeAxis: source.manifest.pageSwipeAxis,
    isSocial: source.manifest.isSocial,
    licensing: source.manifest.licensing,
    basedOnTemplateId: source.manifest.basedOnTemplateId || source.manifest.templateId,
    forkedFromDocId: source.manifest.docId
  });

  // bootstrap already saved; ensure remapped presentation stuck if bootstrap used a copy.
  if (pagePresentation) {
    const next = {
      ...bundle,
      manifest: { ...bundle.manifest, pagePresentation }
    };
    saveLocalDoc(session.pnIdentifier, next);
    return next;
  }
  return bundle;
}
