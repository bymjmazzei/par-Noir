import {
  applyVideoFileDuration,
  editorPreviewPlaybackSrc,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { resolvePenMediaSrc } from './penLocalMedia';
import { probeVideoFileDurationSec } from './probeVideoDuration';

/** Probe a layer video ref and grow the section clock when metadata is available. */
export async function sectionWithProbedVideoLayerDuration(
  section: PenSectionContent,
  layerId: string,
  videoSrc: string,
  docId?: string,
): Promise<PenSectionContent> {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.kind !== 'video') return section;
  const playSrc = editorPreviewPlaybackSrc({ ...layer, videoSrc });
  const resolved = (await resolvePenMediaSrc(playSrc, docId)) || playSrc;
  const seconds = await probeVideoFileDurationSec(resolved);
  if (!seconds) return section;
  const next = applyVideoFileDuration(section, layerId, seconds);
  return next === section ? section : next;
}
