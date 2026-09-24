/**
 * Doc-scoped media — AES-GCM under docKey into Drive as *.penmedia,
 * layer refs rewritten from penlocal: → penmedia:{fileId}.
 */

import type { PenPagePresentation, PenSectionContent } from '@par-noir/pen-protocol';
import {
  MEDIA_SRC_FIELDS,
  getLocalMedia,
  isPenLocalMediaRef,
  parsePenLocalMediaId,
  penMediaRef,
  putLocalMediaForDriveFile,
  type MediaSrcField
} from './penLocalMedia';
import { uploadBytesAsPenMedia } from './penAttach';
import type { PenSession } from './penSession';

function collectPenLocalRefs(
  sections: PenSectionContent[],
  pagePresentation?: PenPagePresentation
): string[] {
  const out = new Set<string>();
  for (const s of sections) {
    for (const layer of s.layers || []) {
      for (const field of MEDIA_SRC_FIELDS) {
        const v = layer[field as MediaSrcField];
        if (typeof v === 'string' && isPenLocalMediaRef(v)) out.add(v);
      }
    }
  }
  if (pagePresentation?.backgroundImage && isPenLocalMediaRef(pagePresentation.backgroundImage)) {
    out.add(pagePresentation.backgroundImage);
  }
  if (pagePresentation?.backgroundVideo && isPenLocalMediaRef(pagePresentation.backgroundVideo)) {
    out.add(pagePresentation.backgroundVideo);
  }
  return [...out];
}

function rewriteRef(
  value: string | undefined,
  map: Map<string, string>
): string | undefined {
  if (!value) return value;
  return map.get(value) || value;
}

function rewriteSections(
  sections: PenSectionContent[],
  map: Map<string, string>
): PenSectionContent[] {
  return sections.map((s) => ({
    ...s,
    layers: s.layers?.map((layer) => {
      const next = { ...layer };
      for (const field of MEDIA_SRC_FIELDS) {
        const cur = next[field as MediaSrcField];
        if (typeof cur === 'string') {
          (next as Record<string, unknown>)[field] = rewriteRef(cur, map);
        }
      }
      return next;
    })
  }));
}

function rewritePresentation(
  pres: PenPagePresentation | undefined,
  map: Map<string, string>
): PenPagePresentation | undefined {
  if (!pres) return pres;
  return {
    ...pres,
    backgroundImage: rewriteRef(pres.backgroundImage, map),
    backgroundVideo: rewriteRef(pres.backgroundVideo, map)
  };
}

/**
 * Upload each penlocal: blob under docKey; rewrite to penmedia:{fileId}.
 * Best-effort — local play must not wait on network.
 */
export async function ensureDocScopedMedia(params: {
  session: PenSession;
  docId: string;
  sections: PenSectionContent[];
  pagePresentation?: PenPagePresentation;
  onSectionsRewritten?: (
    sections: PenSectionContent[],
    pagePresentation?: PenPagePresentation
  ) => void;
}): Promise<{
  sections: PenSectionContent[];
  pagePresentation?: PenPagePresentation;
  rewritten: boolean;
}> {
  const refs = collectPenLocalRefs(params.sections, params.pagePresentation);
  if (!refs.length) {
    return {
      sections: params.sections,
      pagePresentation: params.pagePresentation,
      rewritten: false
    };
  }

  const map = new Map<string, string>();
  for (const ref of refs) {
    const mediaId = parsePenLocalMediaId(ref);
    if (!mediaId) continue;
    const hit = await getLocalMedia(mediaId);
    if (!hit) continue;
    const blob = new Blob([hit.bytes], { type: hit.mime });
    const fileId = await uploadBytesAsPenMedia({
      blob,
      fileName: `media-${mediaId}.penmedia`,
      pnIdentifier: params.session.pnIdentifier,
      docId: params.docId
    });
    if (!fileId) continue;
    await putLocalMediaForDriveFile({
      docId: params.docId,
      fileId,
      blob
    });
    map.set(ref, penMediaRef(fileId));
  }

  if (!map.size) {
    return {
      sections: params.sections,
      pagePresentation: params.pagePresentation,
      rewritten: false
    };
  }

  const sections = rewriteSections(params.sections, map);
  const pagePresentation = rewritePresentation(params.pagePresentation, map);
  params.onSectionsRewritten?.(sections, pagePresentation);
  return { sections, pagePresentation, rewritten: true };
}
