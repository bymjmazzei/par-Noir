/** Editor-only overlay of embed and interactive layers on the social phone. */

import {
  canvasSizeForAspect,
  normalizeGalleryAspect,
  type PenDocManifest,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { tableDocTitle } from '../services/tableDocs';

export function ActionLayerPhoneOverlay({
  sections,
  galleryAspect,
  activeLayerId,
  session,
  onSelectLayer
}: {
  sections: PenSectionContent[];
  galleryAspect?: PenDocManifest['galleryAspect'];
  activeLayerId: string | null;
  session?: PenSession | null;
  onSelectLayer: (id: string) => void;
}) {
  const box = canvasSizeForAspect(normalizeGalleryAspect(galleryAspect));
  const pn = session?.pnIdentifier || '';
  const layers = sections.flatMap((section) =>
    (section.layers || []).filter(
      (layer) =>
        layer.visible !== false && (layer.kind === 'embed' || layer.kind === 'interactive')
    )
  );
  if (layers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden={false}>
      {layers.map((layer) => (
        <button
          key={layer.id}
          type="button"
          className={`pointer-events-auto absolute flex items-center justify-center overflow-hidden px-1 text-center text-[11px] font-medium leading-tight ${
            activeLayerId === layer.id ? 'ring-2 ring-sky-400' : 'ring-1 ring-white/40'
          }`}
          style={{
            left: `${(layer.x / box.w) * 100}%`,
            top: `${(layer.y / box.h) * 100}%`,
            width: `${(layer.w / box.w) * 100}%`,
            height: `${(layer.h / box.h) * 100}%`,
            zIndex: layer.zIndex,
            backgroundColor: layer.backgroundColor || 'rgba(37,99,235,0.85)',
            color: '#fff'
          }}
          title={overlayTitle(layer, pn)}
          onClick={(e) => {
            e.stopPropagation();
            onSelectLayer(layer.id);
          }}
        >
          <span className="truncate">{overlayTitle(layer, pn)}</span>
        </button>
      ))}
    </div>
  );
}

function overlayTitle(layer: PenPageLayer, pn: string): string {
  if (layer.kind === 'interactive') return layer.label || 'Action';
  const ref = layer.refDocId || '';
  if (pn && ref) return tableDocTitle(pn, ref);
  return 'Embed';
}
