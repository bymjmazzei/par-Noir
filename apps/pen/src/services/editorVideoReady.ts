import {
  editorPlaybackSrc,
  publishPlaybackSrc,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import {
  layerOriginalForProxy,
  presentationAwaitingEditProxy
} from './editProxy';

export function editorVideoNeedsProxyForLayer(layer: PenPageLayer): boolean {
  return Boolean(layerOriginalForProxy(layer));
}

export function editorVideoNeedsProxyForPresentation(
  presentation?: Pick<PenPagePresentation, 'backgroundVideo' | 'editProxySrc'> | null
): boolean {
  return presentationAwaitingEditProxy(presentation);
}

/** True when the layer is video and still waiting for editProxySrc on the doc. */
export function editorVideoNeedsProxy(layer: PenPageLayer): boolean {
  return editorVideoNeedsProxyForLayer(layer);
}

/**
 * True when PenMediaPlayer may mount: no proxy pass needed, or proxy ref is set and URL resolved.
 */
export function editorVideoPlayable(
  layer: PenPageLayer,
  opts: { resolvedPlayUrl: string | null | undefined }
): boolean {
  if (!editorVideoNeedsProxyForLayer(layer)) {
    return Boolean(opts.resolvedPlayUrl);
  }
  if (!layer.editProxySrc?.trim()) return false;
  const playRef = editorPlaybackSrc(layer);
  if (!playRef) return false;
  return Boolean(opts.resolvedPlayUrl);
}

export function editorPageBackgroundPlayable(
  presentation: Pick<PenPagePresentation, 'backgroundVideo' | 'editProxySrc'> | null | undefined,
  opts: { resolvedPlayUrl: string | null | undefined }
): boolean {
  const video = presentation?.backgroundVideo?.trim();
  if (!video) return false;
  if (!editorVideoNeedsProxyForPresentation(presentation)) {
    return Boolean(opts.resolvedPlayUrl);
  }
  if (!presentation?.editProxySrc?.trim()) return false;
  const playRef = editorPlaybackSrc({
    backgroundVideo: video,
    editProxySrc: presentation.editProxySrc
  });
  if (!playRef) return false;
  return Boolean(opts.resolvedPlayUrl);
}

export function layerPosterRef(layer: PenPageLayer): string | null {
  return publishPlaybackSrc(layer) || null;
}

export function sectionBlocksPlayback(
  section: PenSectionContent,
  pagePresentation?: Pick<PenPagePresentation, 'backgroundVideo' | 'editProxySrc'> | null,
  isLayerPlayable?: (layer: PenPageLayer) => boolean
): boolean {
  const check = isLayerPlayable ?? (() => false);
  for (const layer of section.layers || []) {
    if (layer.kind !== 'video' && !layer.backgroundVideo?.trim()) continue;
    if (!publishPlaybackSrc(layer)) continue;
    if (editorVideoNeedsProxyForLayer(layer) && !check(layer)) return true;
  }
  if (editorVideoNeedsProxyForPresentation(pagePresentation)) {
    if (!pagePresentation?.editProxySrc?.trim()) return true;
  }
  return false;
}
