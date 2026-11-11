/** How an absolute layer looks on the page or the screen strip. */

import type { ReactNode } from 'react';
import {
  layerMediaSource,
  scorePreviewCaption,
  voteFaceForLayer,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { isPenMediaSrcRef } from '@par-noir/pen-media';
import { PenLayerFace, layerFaceStyle } from '@par-noir/feed-tile';
import { layerDisplayLabel } from './LayersPanel';
import { LayerMediaContent } from './LayerMediaContent';
import { ResolvedPageBackground } from './editablePagePreview/ResolvedPageBackground';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

export function PreviewLayerFace({
  layer,
  layers,
  section,
  presentation,
  session,
  docId,
  inputValues,
  onInputValue,
  onSelect,
  onNaturalAspect,
  selected = false,
  editor = true
}: {
  layer: PenPageLayer;
  layers: PenPageLayer[];
  /** Poll and score captions read the section; defaults to `layers`. */
  section?: PenSectionContent;
  presentation: PenPagePresentation;
  session?: PenSession | null;
  docId?: string;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
  onSelect: () => void;
  onNaturalAspect?: (aspect: number) => void;
  selected?: boolean;
  /** False draws the viewer face: no placeholders, scrollbars or editor outlines. */
  editor?: boolean;
}) {
  const source = layerMediaSource(layer);
  const backgroundRef =
    source?.kind === 'image' && layer.kind !== 'image' && isPenMediaSrcRef(source.src) ? source.src : '';
  const { resolved: backgroundImageSrc } = useResolvedMediaSrc(backgroundRef, { docId, session });

  if (layer.kind === 'embed') {
    return (
      <div
        className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-left text-xs text-stone-200"
        style={layerFaceStyle(layer)}
        title={layerDisplayLabel(layer, layers)}
      >
        <div className="font-medium text-stone-100">Embed</div>
        <div className="truncate font-mono text-[10px] text-stone-400">{layer.refDocId || '(no ref)'}</div>
      </div>
    );
  }

  const sec: PenSectionContent = section || { slug: '', doc: { type: 'doc', content: [] }, layers };
  let media: ReactNode;
  if (layer.kind === 'image' || layer.kind === 'video') {
    media = (
      <LayerMediaContent
        layer={layer}
        onActivate={onSelect}
        docId={docId}
        session={session}
        onNaturalAspect={onNaturalAspect}
        selected={selected}
      />
    );
  } else if (source?.kind === 'video') {
    media = (
      <ResolvedPageBackground
        src={layer.backgroundVideo || ''}
        videoSrc={layer.videoSrc}
        kind="video"
        docId={docId}
        session={session}
      />
    );
  }

  let runtimeLabel: string | undefined;
  if (layer.kind === 'interactive' && layer.behavior === 'poll.vote') {
    const counts = layers.find((item) => item.id === layer.parentGroupId)?.widgetCounts || null;
    runtimeLabel = voteFaceForLayer(sec, layer, null, counts).text || undefined;
  }
  const caption =
    layer.widgetElement === 'score'
      ? scorePreviewCaption(sec.layers || [], layer.parentGroupId || null)
      : undefined;

  return (
    <PenLayerFace
      layer={layer}
      editor={editor}
      fontFamily={presentation.fontFamily}
      runtimeLabel={runtimeLabel}
      caption={caption}
      inputValue={inputValues?.[layer.id]}
      onInput={onInputValue}
      onPress={() => onSelect()}
      mediaSrc={backgroundImageSrc || undefined}
      media={media}
      title={layer.kind === 'group' ? layerDisplayLabel(layer, layers) : undefined}
    />
  );
}
