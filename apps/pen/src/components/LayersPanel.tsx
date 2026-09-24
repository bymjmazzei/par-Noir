/**
 * Floating layers list (not a third column).
 * Page frame is always row 0; + adds overlay text objects.
 * Create group = folder; drag layers onto a group to nest; multi-select ≥2 shows align.
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
  alignLayers,
  createGroupFromSelection,
  createTextLayer,
  defaultLayerName,
  distributeLayers,
  normalizeSection,
  PAGE_LAYER_ID,
  patchLayerStyle,
  removeLayer,
  reorderLayersStack,
  setLayerParentGroup,
  upsertLayer,
  wrapSideFromGeom,
  type LayerAlignMode,
  type PenPageLayer,
  type PenPageLayout,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from './icons/PenIcons';

export function layerDisplayLabel(layer: PenPageLayer, all: PenPageLayer[]): string {
  return defaultLayerName(layer, all);
}

export function pageLayerLabel(pageLayout: PenPageLayout | undefined): string {
  if (pageLayout === 'letter') return 'Body · Letter';
  if (pageLayout === 'a4') return 'Body · A4';
  return 'Body';
}

function AlignBtn({
  title,
  onClick,
  children
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center text-neutral-600 hover:text-black"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ListRow =
  | { kind: 'page' }
  | { kind: 'layer'; layer: PenPageLayer; depth: number };

export function LayersPopover({
  open,
  onClose,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  anchorRef,
  pageLayout,
  selectedIds,
  onSelectedIdsChange,
  contentWidthPx = 736
}: {
  open: boolean;
  onClose: () => void;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  anchorRef?: RefObject<HTMLElement | null>;
  pageLayout?: PenPageLayout;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  contentWidthPx?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const prepared = useMemo(() => normalizeSection(section), [section]);
  const allLayers = prepared.layers || [];
  const layersFrontFirst = useMemo(
    () => [...allLayers].sort((a, b) => b.zIndex - a.zIndex),
    [allLayers]
  );

  /**
   * Nested list: absolute overlays front-first (top = front), then Body (layer 0),
   * with body-wrap objects nested under Body (same-layer wrap).
   */
  const listRows: ListRow[] = useMemo(() => {
    const rows: ListRow[] = [];
    const top = layersFrontFirst.filter((l) => !l.parentGroupId && !l.bodyWrap);
    for (const layer of top) {
      rows.push({ kind: 'layer', layer, depth: 0 });
      if (layer.kind === 'group') {
        const kids = layersFrontFirst.filter((l) => l.parentGroupId === layer.id);
        for (const kid of kids) {
          rows.push({ kind: 'layer', layer: kid, depth: 1 });
        }
      }
    }
    rows.push({ kind: 'page' });
    const wrapped = layersFrontFirst.filter((l) => Boolean(l.bodyWrap) && !l.parentGroupId);
    for (const layer of wrapped) {
      rows.push({ kind: 'layer', layer, depth: 1 });
    }
    return rows;
  }, [layersFrontFirst]);

  const pageSelected = !activeLayerId || activeLayerId === PAGE_LAYER_ID;
  const multiObjectIds = selectedIds.filter((id) => id !== PAGE_LAYER_ID);
  const showAlign = multiObjectIds.length >= 2;

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
    const n = allLayers.filter((l) => l.kind !== 'group').length + 1;
    const layer = createTextLayer({
      x: 12,
      y: 12 + (layersFrontFirst.length % 4) * 8,
      zIndex: maxZ() + 1,
      name: `Layer ${n}`
    });
    commit(upsertLayer(prepared, layer));
    onSelectLayer(layer.id);
    onSelectedIdsChange([layer.id]);
  }

  function onCreateGroup() {
    const wrapIds = multiObjectIds.filter((id) => {
      const l = allLayers.find((x) => x.id === id);
      return l && l.kind !== 'group';
    });
    const { section: next, groupId } = createGroupFromSelection(prepared, wrapIds);
    commit(next);
    onSelectLayer(groupId);
    onSelectedIdsChange([groupId]);
  }

  function onDelete(id: string) {
    const next = removeLayer(prepared, id);
    commit(next);
    onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    if (activeLayerId === id) onSelectLayer(PAGE_LAYER_ID);
  }

  function selectObject(id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) {
    const multi = e.metaKey || e.ctrlKey || e.shiftKey;
    if (multi) {
      const set = new Set(selectedIds.filter((x) => x !== PAGE_LAYER_ID));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const next = [...set];
      onSelectedIdsChange(next);
      onSelectLayer(next[next.length - 1] || PAGE_LAYER_ID);
    } else {
      onSelectedIdsChange([id]);
      onSelectLayer(id);
    }
  }

  function onRowPointerDown(e: ReactPointerEvent, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setHoverId(id);
    selectObject(id, e);
  }

  function onRowPointerMove(e: ReactPointerEvent) {
    if (!dragId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-layer-id]') as HTMLElement | null;
    const hid = row?.dataset.layerId;
    if (hid) setHoverId(hid);
  }

  function onRowPointerUp() {
    if (dragId && hoverId && dragId !== hoverId) {
      const dragLayer = allLayers.find((l) => l.id === dragId);
      const hoverLayer = allLayers.find((l) => l.id === hoverId);
      // Drop onto Body → wrap with Body (side from horizontal position)
      if (hoverId === PAGE_LAYER_ID && dragLayer && dragLayer.kind !== 'group') {
        const side = wrapSideFromGeom(dragLayer.x, dragLayer.w, contentWidthPx);
        let next = setLayerParentGroup(prepared, dragId, null);
        next = patchLayerStyle(next, dragId, { bodyWrap: side });
        commit(next);
      } else if (
        hoverLayer?.kind === 'group' &&
        dragLayer &&
        dragLayer.kind !== 'group' &&
        dragId !== hoverId
      ) {
        let next = patchLayerStyle(prepared, dragId, { bodyWrap: undefined });
        next = setLayerParentGroup(next, dragId, hoverId);
        commit(next);
      } else if (hoverId !== PAGE_LAYER_ID) {
        // Reorder in absolute stack; leaving Body wrap clears wrap
        let next = prepared;
        if (dragLayer?.bodyWrap) {
          next = patchLayerStyle(next, dragId, { bodyWrap: undefined });
        }
        const ids = layersFrontFirst.map((l) => l.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(hoverId);
        if (from >= 0 && to >= 0) {
          const order = [...ids];
          order.splice(from, 1);
          order.splice(to, 0, dragId);
          commit(reorderLayersStack(next, order));
        } else if (dragLayer?.bodyWrap) {
          commit(next);
        }
      }
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

  function runAlign(mode: LayerAlignMode) {
    commit(alignLayers(prepared, multiObjectIds, mode));
  }

  function runDistribute(axis: 'h' | 'v') {
    commit(distributeLayers(prepared, multiObjectIds, axis));
  }

  let objectIndex = 0;

  return (
    <div
      ref={panelRef}
      className="absolute right-3 top-10 z-40 flex w-72 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
      role="dialog"
      aria-label="Layers"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-neutral-200 px-1.5 py-1.5">
        <span className="mr-auto px-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Layers
        </span>
        {showAlign && (
          <>
            <AlignBtn title="Align left" onClick={() => runAlign('left')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 4v16M8 8h10v3H8zm0 5h7v3H8z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            <AlignBtn title="Align center" onClick={() => runAlign('centerH')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 4v16M7 8h10v3H7zm2 5h6v3H9z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            <AlignBtn title="Align right" onClick={() => runAlign('right')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M20 4v16M6 8h10v3H6zm3 5h7v3H9z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            <AlignBtn title="Align top" onClick={() => runAlign('top')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 4h16M8 8v10h3V8zm5 0v7h3V8z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            <AlignBtn title="Align middle" onClick={() => runAlign('middleV')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 12h16M8 7v10h3V7zm5 2v6h3V9z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            <AlignBtn title="Align bottom" onClick={() => runAlign('bottom')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 20h16M8 6v10h3V6zm5 3v7h3V9z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </AlignBtn>
            {multiObjectIds.length >= 3 && (
              <>
                <AlignBtn title="Distribute horizontally" onClick={() => runDistribute('h')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 4v16M20 4v16M9 8h2v8H9zm4 0h2v8h-2z" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </AlignBtn>
                <AlignBtn title="Distribute vertically" onClick={() => runDistribute('v')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 4h16M4 20h16M8 9h8v2H8zm0 4h8v2H8z" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </AlignBtn>
              </>
            )}
          </>
        )}
        <button
          type="button"
          title="Create group"
          aria-label="Create group"
          className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600 hover:text-black"
          onClick={onCreateGroup}
        >
          <FolderIcon />
          Group
        </button>
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
        {listRows.map((row) => {
          if (row.kind === 'page') {
            const dropTarget = Boolean(dragId && hoverId === PAGE_LAYER_ID && dragId !== PAGE_LAYER_ID);
            return (
              <li
                key={PAGE_LAYER_ID}
                data-layer-id={PAGE_LAYER_ID}
                title="Drop an object here to wrap Body text around it"
                className={`flex cursor-pointer items-center gap-1 px-2 py-1.5 text-[12px] ${
                  pageSelected && selectedIds.length <= 1
                    ? 'bg-neutral-100 font-bold text-black'
                    : 'text-neutral-600 hover:bg-neutral-50'
                } ${dropTarget ? 'ring-1 ring-inset ring-black bg-sky-50' : ''}`}
                onClick={() => {
                  onSelectedIdsChange([PAGE_LAYER_ID]);
                  onSelectLayer(PAGE_LAYER_ID);
                }}
              >
                <span className="w-4 shrink-0 text-[10px] text-neutral-400">0</span>
                <span className="min-w-0 flex-1 truncate">{pageLayerLabel(pageLayout)}</span>
                {dropTarget && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                    Wrap
                  </span>
                )}
              </li>
            );
          }

          const { layer, depth } = row;
          const selected = selectedIds.includes(layer.id);
          const dropTarget = Boolean(dragId && hoverId === layer.id && dragId !== layer.id);
          const isVisible = layer.visible !== false;
          const isLocked = Boolean(layer.positionLocked);
          const isGroup = layer.kind === 'group';
          const isWrapped = Boolean(layer.bodyWrap);
          if (!isGroup) objectIndex += 1;
          const indexLabel = isGroup ? 'G' : String(objectIndex);

          return (
            <li
              key={layer.id}
              data-layer-id={layer.id}
              className={`flex cursor-grab items-center gap-1 px-2 py-1.5 text-[12px] active:cursor-grabbing ${
                selected ? 'bg-neutral-100 font-bold text-black' : 'text-neutral-600 hover:bg-neutral-50'
              } ${dropTarget ? 'ring-1 ring-inset ring-black' : ''} ${
                dragId === layer.id ? 'opacity-50' : ''
              } ${!isVisible ? 'opacity-60' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onPointerDown={(e) => onRowPointerDown(e, layer.id)}
            >
              <span className="w-4 shrink-0 text-[10px] text-neutral-400">{indexLabel}</span>
              {isGroup && (
                <span className="shrink-0 text-neutral-500">
                  <FolderIcon />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {layerDisplayLabel(layer, allLayers)}
              </span>
              {isWrapped && (
                <span
                  className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-sky-700"
                  title="Wrapped with Body"
                >
                  Wrap
                </span>
              )}
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
                title={isGroup ? 'Delete group' : 'Delete layer'}
                aria-label={isGroup ? 'Delete group' : 'Delete layer'}
                className="shrink-0 p-0.5 text-neutral-400 hover:text-red-600"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(layer.id);
                }}
              >
                <IconTrash />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
