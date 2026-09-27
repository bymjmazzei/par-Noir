/** Editor-only overlay of a copied widget group on the social phone. */

import {
  canvasSizeForAspect,
  docToPlainText,
  getTextLayerDoc,
  normalizeGalleryAspect,
  type PenDocManifest,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { tableDocTitle } from '../services/tableDocs';

function paintsOnPhone(layer: PenPageLayer): boolean {
  if (layer.visible === false || layer.kind === 'group') return false;
  if (layer.parentGroupId) {
    return (
      layer.kind === 'text' ||
      layer.kind === 'embed' ||
      layer.kind === 'interactive' ||
      layer.kind === 'image'
    );
  }
  return layer.kind === 'embed' || layer.kind === 'interactive';
}

export function ActionLayerPhoneOverlay({
  sections,
  galleryAspect,
  activeLayerId,
  session,
  onSelectLayer,
  onPollVote
}: {
  sections: PenSectionContent[];
  galleryAspect?: PenDocManifest['galleryAspect'];
  activeLayerId: string | null;
  session?: PenSession | null;
  onSelectLayer: (id: string) => void;
  onPollVote?: (layer: PenPageLayer) => void;
}) {
  const box = canvasSizeForAspect(normalizeGalleryAspect(galleryAspect));
  const pn = session?.pnIdentifier || '';
  const layers = sections.flatMap((section) =>
    (section.layers || []).filter(paintsOnPhone)
  );
  if (layers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden={false}>
      {layers.map((layer) => {
        const label = overlayTitle(layer, pn);
        const text = layer.kind === 'text';
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
              color: text ? '#141414' : '#fff'
            }}
            title={label || layer.name || 'Layer'}
            onClick={(e) => {
              e.stopPropagation();
              if (layer.behavior === 'poll.vote') onPollVote?.(layer);
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

function overlayTitle(layer: PenPageLayer, pn: string): string {
  if (layer.kind === 'text') return docToPlainText(getTextLayerDoc(layer)).trim();
  if (layer.kind === 'interactive') return layer.label || layer.name || '';
  if (layer.kind === 'image') return layer.name || '';
  const ref = layer.refDocId || '';
  if (pn && ref) return tableDocTitle(pn, ref);
  return layer.name || 'Embed';
}
