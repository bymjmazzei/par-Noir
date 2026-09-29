/** Editor overlay: each layer paints at the rectangle it was given. */

import {
  canvasSizeForAspect,
  docToPlainText,
  formatCountdown,
  getTextLayerDoc,
  normalizeGalleryAspect,
  revealSibling,
  voteFaceForLayer,
  type PenDocManifest,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { tableDocTitle } from '../services/tableDocs';
import { WidgetTextInput } from './WidgetTextInput';

function paintsOnPhone(layer: PenPageLayer): boolean {
  if (layer.visible === false || layer.kind === 'group') return false;
  if (
    layer.kind === 'interactive' ||
    layer.widgetElement === 'html' ||
    layer.widgetElement === 'time' ||
    layer.widgetElement === 'input'
  ) {
    return true;
  }
  if (layer.parentGroupId) {
    return layer.kind === 'text' || layer.kind === 'embed' || layer.kind === 'image' || layer.widgetElement === 'svg';
  }
  return layer.kind === 'embed';
}

export function ActionLayerPhoneOverlay({
  sections,
  galleryAspect,
  activeLayerId,
  session,
  onSelectLayer,
  onPollVote,
  onWidgetAction,
  onSectionChange,
  votedOptionByGroup,
  inputValues,
  onInputValue
}: {
  sections: PenSectionContent[];
  galleryAspect?: PenDocManifest['galleryAspect'];
  activeLayerId: string | null;
  session?: PenSession | null;
  onSelectLayer: (id: string) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
  onSectionChange?: (section: PenSectionContent) => void;
  votedOptionByGroup?: Record<string, string>;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
}) {
  const box = canvasSizeForAspect(normalizeGalleryAspect(galleryAspect));
  const pn = session?.pnIdentifier || '';
  const placed = sections.flatMap((section) =>
    (section.layers || []).filter(paintsOnPhone).map((layer) => ({ section, layer }))
  );
  if (placed.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden={false}>
      {placed.map(({ section, layer }) => {
        if (layer.widgetElement === 'input') {
          return (
            <div
              key={layer.id}
              className="pointer-events-auto absolute overflow-hidden"
              style={{
                left: `${(layer.x / box.w) * 100}%`,
                top: `${(layer.y / box.h) * 100}%`,
                width: `${(layer.w / box.w) * 100}%`,
                height: `${(layer.h / box.h) * 100}%`,
                zIndex: layer.zIndex
              }}
            >
              <WidgetTextInput
                layer={layer}
                value={inputValues?.[layer.id] || ''}
                onChange={(layerId, value) => onInputValue?.(layerId, value)}
                onSelect={() => onSelectLayer(layer.id)}
              />
            </div>
          );
        }
        const label = overlayTitle(section, layer, pn, votedOptionByGroup);
        const text = layer.kind === 'text' && layer.widgetElement !== 'time';
        return (
          <button
            key={layer.id}
            type="button"
            className={`pointer-events-auto absolute flex items-center justify-center overflow-hidden px-1 text-center text-[11px] font-medium leading-tight ${
              activeLayerId === layer.id ? 'ring-2 ring-sky-400' : ''
            }`}
            style={{
              left: `${(layer.x / box.w) * 100}%`,
              top: `${(layer.y / box.h) * 100}%`,
              width: `${(layer.w / box.w) * 100}%`,
              height: `${(layer.h / box.h) * 100}%`,
              zIndex: layer.zIndex,
              backgroundColor: layer.backgroundColor || (text ? 'transparent' : 'rgba(37,99,235,0.85)'),
              color: layer.textColor || (text ? '#141414' : '#fff'),
              borderRadius: layer.cornerRadius ? `${layer.cornerRadius}px` : undefined
            }}
            title={label || layer.name || 'Layer'}
            onClick={(e) => {
              e.stopPropagation();
              if (layer.behavior === 'poll.vote') onPollVote?.(layer);
              else if (layer.behavior === 'widget.reveal') onSectionChange?.(revealSibling(section, layer.id));
              else if (layer.behavior) onWidgetAction?.(layer);
              onSelectLayer(layer.id);
            }}
          >
            {label ? <span className="truncate">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function overlayTitle(
  section: PenSectionContent,
  layer: PenPageLayer,
  pn: string,
  votedOptionByGroup?: Record<string, string>
): string {
  if (layer.widgetElement === 'time') {
    return layer.closesAt ? formatCountdown(layer.closesAt) : 'Time';
  }
  if (layer.kind === 'interactive' && layer.behavior === 'poll.vote') {
    const groupKey = layer.parentGroupId || 'doc';
    const counts = section.layers?.find((item) => item.id === layer.parentGroupId)?.widgetCounts || null;
    return voteFaceForLayer(section, layer, votedOptionByGroup?.[groupKey] || null, counts).text;
  }
  if (layer.kind === 'text') return docToPlainText(getTextLayerDoc(layer)).trim();
  if (layer.kind === 'interactive') return layer.label || layer.name || '';
  if (layer.kind === 'image') return layer.name || '';
  const ref = layer.refDocId || '';
  if (pn && ref) return tableDocTitle(pn, ref);
  return layer.name || 'Embed';
}
