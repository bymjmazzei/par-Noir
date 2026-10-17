import {
  applyVideoFileDuration,
  publishPlaybackSrc,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { resolvePenMediaSrc } from '@par-noir/pen-media';
import { waitForVideoLayerDurationSec } from './videoLayerDuration';

/** Probe a layer video ref and grow the section clock when metadata is available. */
export async function sectionWithProbedVideoLayerDuration(
  section: PenSectionContent,
  layerId: string,
  videoSrc: string
): Promise<PenSectionContent> {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.kind !== 'video') return section;
  const playSrc = publishPlaybackSrc({ ...layer, videoSrc });
  const resolved = (await resolvePenMediaSrc(playSrc)) || playSrc;
  const seconds = await waitForVideoLayerDurationSec(layerId, resolved);
  if (!seconds) return section;
  const next = applyVideoFileDuration(section, layerId, seconds);
  return next === section ? section : next;
}
