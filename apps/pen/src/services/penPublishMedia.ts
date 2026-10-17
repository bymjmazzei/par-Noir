/**
 * Make every layer media ref playable on this device before feed compose.
 */

import {
  publishPlaybackSrc,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { ensurePenMediaUrl, isPenMediaSrcRef } from '@par-noir/pen-media';
import type { PenSession } from './penSession';

async function ensureRefResolvable(
  ref: string | undefined,
  session: PenSession,
  docId: string
): Promise<void> {
  const src = ref?.trim();
  if (!src || !isPenMediaSrcRef(src)) return;
  const url = await ensurePenMediaUrl({ src, docId, pnIdentifier: session.pnIdentifier });
  if (!url) throw new Error('publish_media_missing');
}

/** Ensure layer media is in the local cache before on-device video compose. */
export async function ensurePublishPlaybackBytes(params: {
  session: PenSession;
  docId: string;
  sections: PenSectionContent[];
  pagePresentation?: PenPagePresentation;
}): Promise<void> {
  const refs: (string | undefined)[] = [];
  for (const section of params.sections) {
    for (const layer of section.layers || []) {
      refs.push(publishPlaybackSrc(layer), layer.imageSrc, layer.paintOverlaySrc);
    }
  }
  const pres = params.pagePresentation;
  refs.push(pres?.backgroundVideo, pres?.backgroundImage);
  for (const ref of refs) await ensureRefResolvable(ref, params.session, params.docId);
}
