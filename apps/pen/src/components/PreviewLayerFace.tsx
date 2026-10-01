/** How an absolute layer looks on the page or the screen strip. */

import type { CSSProperties } from 'react';
import {
  docToHtml,
  docToPlainText,
  timeLayerCaption,
  getTextLayerDoc,
  revealSibling,
  sanitizeWidgetMarkup,
  voteFaceForLayer,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { layerDisplayLabel } from './LayersPanel';
import { WidgetTextInput } from './WidgetTextInput';
import { layerPreviewStyle } from './LayerObjectToolbar';
import { LayerMediaContent } from './LayerMediaContent';
import type { PenSession } from '../services/penSession';
import { ResolvedPageBackground } from './EditablePagePreview';

export function PreviewLayerFace({
  layer,
  layers,
  section,
  presentation,
  session,
  docId,
  buttonCaptionById,
  votedOptionByGroup,
  inputValues,
  onInputValue,
  onSelect,
  onSectionChange,
  onPollVote,
  onWidgetAction,
  onNaturalAspect,
  selected = false
}: {
  layer: PenPageLayer;
  layers: PenPageLayer[];
  section: PenSectionContent;
  presentation: PenPagePresentation;
  session?: PenSession | null;
  docId?: string;
  buttonCaptionById?: Record<string, string>;
  votedOptionByGroup?: Record<string, string>;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
  onSelect: () => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
  onNaturalAspect?: (aspect: number) => void;
  selected?: boolean;
}) {
  const shell = layerPreviewStyle(layer);
  if (layer.kind === 'group') {
    return <div className="h-full w-full" style={shell} title={layerDisplayLabel(layer, layers)} />;
  }
  if (layer.kind === 'image' || layer.kind === 'video') {
    const { filter: _filter, ...shellRest } = shell as CSSProperties & { filter?: string };
    return (
      <div className="relative h-full w-full" style={shellRest}>
        <LayerMediaContent
          layer={layer}
          onActivate={onSelect}
          docId={docId}
          session={session}
          onNaturalAspect={onNaturalAspect}
          selected={selected}
        />
      </div>
    );
  }
  if (layer.kind === 'embed') {
    return (
      <div
        className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-left text-xs text-stone-200"
        style={shell}
        title={layerDisplayLabel(layer, layers)}
      >
        <div className="font-medium text-stone-100">Embed</div>
        <div className="truncate font-mono text-[10px] text-stone-400">{layer.refDocId || '(no ref)'}</div>
      </div>
    );
  }
  if (layer.widgetElement === 'svg' && layer.svgSrc) {
    return (
      <div
        className="h-full w-full overflow-hidden"
        style={shell}
        dangerouslySetInnerHTML={{ __html: sanitizeWidgetMarkup(layer.svgSrc) }}
      />
    );
  }
  if (layer.widgetElement === 'html') {
    return (
      <iframe
        title={layer.name || 'Snippet'}
        sandbox=""
        className="pointer-events-auto h-full w-full border-0 bg-white"
        srcDoc={layer.htmlSource || ''}
      />
    );
  }
  if (layer.widgetElement === 'input') {
    return (
      <WidgetTextInput
        layer={layer}
        value={inputValues?.[layer.id] || ''}
        onChange={(layerId, value) => onInputValue?.(layerId, value)}
        onSelect={onSelect}
      />
    );
  }
  if (layer.widgetElement === 'time') {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs" style={shell}>
        {timeLayerCaption(layer)}
      </div>
    );
  }
  if (layer.kind === 'interactive') {
    const groupKey = layer.parentGroupId || 'doc';
    const counts = layers.find((item) => item.id === layer.parentGroupId)?.widgetCounts || null;
    const runtime =
      layer.behavior === 'poll.vote'
        ? voteFaceForLayer(section, layer, votedOptionByGroup?.[groupKey] || null, counts).text
        : buttonCaptionById?.[layer.id];
    const face = layer.textDoc ? docToPlainText(layer.textDoc) : '';
    const rich = face ? docToHtml(layer.textDoc) : '';
    return (
      <button
        type="button"
        className="pointer-events-auto flex h-full w-full items-center justify-center px-3 text-sm font-medium"
        style={{ ...shell, color: layer.textColor || '#ffffff' }}
        title={layer.behavior || 'button'}
        onClick={(e) => {
          e.stopPropagation();
          if (layer.behavior === 'poll.vote') onPollVote?.(layer);
          else if (layer.behavior === 'widget.reveal') onSectionChange(revealSibling(section, layer.id));
          else if (layer.behavior) onWidgetAction?.(layer);
          onSelect();
        }}
      >
        {runtime ? (
          runtime
        ) : layer.label ? (
          layer.label
        ) : rich ? (
          <span className="pen-rich-html" dangerouslySetInnerHTML={{ __html: rich }} />
        ) : (
          'Button'
        )}
      </button>
    );
  }
  if (layer.backgroundVideo) {
    return (
      <div className="relative h-full w-full overflow-hidden" style={shell}>
        <div className="absolute inset-0">
          <ResolvedPageBackground
            src={layer.backgroundVideo}
            editProxySrc={layer.editProxySrc}
            videoSrc={layer.videoSrc}
            kind="video"
            docId={docId}
            session={session}
          />
        </div>
        <div
          className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
          style={{
            fontFamily: presentation.fontFamily || undefined,
            color: presentation.textColor || '#111'
          }}
          dangerouslySetInnerHTML={{
            __html: docToHtml(getTextLayerDoc(layer)) || '<p class="text-neutral-400">Text</p>'
          }}
        />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden" style={shell}>
      <div
        className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
        style={{
          fontFamily: presentation.fontFamily || undefined,
          color: presentation.textColor || '#111'
        }}
        dangerouslySetInnerHTML={{
          __html: docToHtml(getTextLayerDoc(layer)) || '<p class="text-neutral-400">Text</p>'
        }}
      />
    </div>
  );
}
