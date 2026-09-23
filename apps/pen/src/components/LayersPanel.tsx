/**
 * Floating layers list (not a third column).
 * Page frame is always row 0; + adds overlay text objects.
 * Object fill/FX live on the preview bar (LayerObjectToolbar), not here.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react';
import {
  createTextLayer,
  docToPlainText,
  getTextLayerDoc,
  normalizeSection,
  PAGE_LAYER_ID,
  patchLayerStyle,
  removeLayer,
  reorderLayersStack,
  upsertLayer,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { IconEye, IconEyeOff, IconLock, IconUnlock } from './icons/PenIcons';

export function layerDisplayLabel(
  layer: PenPageLayer,
  indexFromFront: number
): string {
  if (layer.kind === 'image') return `Image ${indexFromFront + 1}`;
  if (layer.kind === 'video') return `Video ${indexFromFront + 1}`;
  const plain = docToPlainText(getTextLayerDoc(layer)).trim().slice(0, 28);
  return plain || `Text ${indexFromFront + 1}`;
}

export function pageLayerLabel(pageLayout: PenPageLayout | undefined): string {
  if (pageLayout === 'letter') return 'Page · Letter';
  if (pageLayout === 'a4') return 'Page · A4';
  return 'Page · Flow';
}

export function LayersPopover({
  open,
  onClose,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  anchorRef,
  pageLayout
}: {
  open: boolean;
  onClose: () => void;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  anchorRef?: RefObject<HTMLElement | null>;
  pageLayout?: PenPageLayout;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const prepared = useMemo(() => normalizeSection(section), [section]);
  const layersFrontFirst = useMemo(
    () => [...(prepared.layers || [])].sort((a, b) => b.zIndex - a.zIndex),
    [prepared.layers]
  );
  const pageSelected =
    !activeLayerId || activeLayerId === PAGE_LAYER_ID;

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  function commit(next: PenSectionContent) {
    onSectionChange(next);
  }

  function maxZ() {
    return layersFrontFirst.reduce((m, l) => Math.max(m, l.zIndex), 0);
  }

  function addTextLayer() {
    const layer = createTextLayer({
      x: 12,
      y: 12 + (layersFrontFirst.length % 4) * 8,
      w: 50,
      h: 24,
      zIndex: maxZ() + 1
    });
    commit(upsertLayer(prepared, layer));
    onSelectLayer(layer.id);
  }

  function onDelete(id: string) {
    const next = removeLayer(prepared, id);
    commit(next);
    if (activeLayerId === id) onSelectLayer(PAGE_LAYER_ID);
  }

  function applyReorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = layersFrontFirst.map((l) => l.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    commit(reorderLayersStack(prepared, next));
  }

  function onRowPointerDown(e: ReactPointerEvent, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setHoverId(id);
    onSelectLayer(id);
  }

  function onRowPointerMove(e: ReactPointerEvent) {
    if (!dragId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-layer-id]') as HTMLElement | null;
    setHoverId(row?.dataset.layerId || null);
  }

  function onRowPointerUp() {
    if (dragId && hoverId && dragId !== hoverId) {
      applyReorder(dragId, hoverId);
    }
    setDragId(null);
    setHoverId(null);
  }

  function patchLayer(
    layerId: string,
    patch: Partial<Pick<PenPageLayer, 'visible' | 'positionLocked'>>
  ) {
    commit(patchLayerStyle(prepared, layerId, patch));
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-3 top-10 z-40 flex w-64 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
      role="dialog"
      aria-label="Layers"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-2.5 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-black">Layers</span>
        <button
          type="button"
          title="Add text layer"
          aria-label="Add text layer"
          className="inline-flex h-7 w-7 items-center justify-center text-black hover:opacity-60"
          onClick={addTextLayer}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <ul
        className="max-h-56 min-h-0 overflow-auto py-1"
        onPointerMove={onRowPointerMove}
        onPointerUp={onRowPointerUp}
        onPointerLeave={() => {
          if (dragId) {
            setDragId(null);
            setHoverId(null);
          }
        }}
      >
        <li
          data-layer-id={PAGE_LAYER_ID}
          className={`flex cursor-pointer items-center gap-1 px-2 py-1.5 text-[12px] ${
            pageSelected
              ? 'bg-neutral-100 font-bold text-black'
              : 'text-neutral-600 hover:bg-neutral-50'
          }`}
          onClick={() => onSelectLayer(PAGE_LAYER_ID)}
        >
          <span className="w-4 shrink-0 text-[10px] text-neutral-400">0</span>
          <span className="min-w-0 flex-1 truncate">{pageLayerLabel(pageLayout)}</span>
        </li>

        {layersFrontFirst.map((layer, i) => {
          const selected = activeLayerId === layer.id;
          const dropTarget = Boolean(dragId && hoverId === layer.id && dragId !== layer.id);
          const isVisible = layer.visible !== false;
          const isLocked = Boolean(layer.positionLocked);
          return (
            <li
              key={layer.id}
              data-layer-id={layer.id}
              className={`flex cursor-grab items-center gap-1 px-2 py-1.5 text-[12px] active:cursor-grabbing ${
                selected ? 'bg-neutral-100 font-bold text-black' : 'text-neutral-600 hover:bg-neutral-50'
              } ${dropTarget ? 'ring-1 ring-inset ring-black' : ''} ${
                dragId === layer.id ? 'opacity-50' : ''
              } ${!isVisible ? 'opacity-60' : ''}`}
              onPointerDown={(e) => onRowPointerDown(e, layer.id)}
            >
              <span className="w-4 shrink-0 text-[10px] text-neutral-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {layerDisplayLabel(layer, i)}
              </span>
              <button
                type="button"
                title={isVisible ? 'Hide layer' : 'Show layer'}
                aria-label={isVisible ? 'Hide layer' : 'Show layer'}
                className="shrink-0 p-0.5 text-neutral-500 hover:text-black"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  patchLayer(layer.id, { visible: !isVisible });
                }}
              >
                {isVisible ? <IconEye /> : <IconEyeOff />}
              </button>
              <button
                type="button"
                title={isLocked ? 'Unlock position' : 'Lock position'}
                aria-label={isLocked ? 'Unlock position' : 'Lock position'}
                className="shrink-0 p-0.5 text-neutral-500 hover:text-black"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  patchLayer(layer.id, { positionLocked: !isLocked });
                }}
              >
                {isLocked ? <IconLock /> : <IconUnlock />}
              </button>
              <button
                type="button"
                title="Delete layer"
                className="shrink-0 px-1 text-neutral-400 hover:text-red-600"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(layer.id);
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
