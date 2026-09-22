import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react';
import {
  attachMediaToLayer,
  clearLayerAttachment,
  createTextLayer,
  docToPlainText,
  ensureDefaultTextLayer,
  getTextLayerDoc,
  normalizeSection,
  patchLayerStyle,
  removeLayer,
  reorderLayersStack,
  upsertLayer,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';

function layerLabel(layer: PenPageLayer, indexFromFront: number): string {
  if (layer.kind === 'image') return `Image ${indexFromFront + 1}`;
  if (layer.kind === 'video') return `Video ${indexFromFront + 1}`;
  const plain = docToPlainText(getTextLayerDoc(layer)).trim().slice(0, 28);
  return plain || `Text ${indexFromFront + 1}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Floating layers widget (not a third column).
 * + adds a text layer; Attach on a row converts that object to image/video.
 * Click outside closes.
 */
export function LayersPopover({
  open,
  onClose,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  anchorRef
}: {
  open: boolean;
  onClose: () => void;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachKind, setAttachKind] = useState<'image' | 'video'>('image');
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const prepared = useMemo(() => ensureDefaultTextLayer(normalizeSection(section)), [section]);
  const layersFrontFirst = useMemo(
    () => [...(prepared.layers || [])].sort((a, b) => b.zIndex - a.zIndex),
    [prepared.layers]
  );
  const active = layersFrontFirst.find((l) => l.id === activeLayerId) || null;

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

  function startAttach(layerId: string, kind: 'image' | 'video') {
    setAttachTargetId(layerId);
    setAttachKind(kind);
    onSelectLayer(layerId);
    // defer so input accepts click after state set
    requestAnimationFrame(() => attachRef.current?.click());
  }

  async function onAttachFile(file: File) {
    if (!attachTargetId) return;
    const src = await readFileAsDataUrl(file);
    if (!src) return;
    commit(
      attachMediaToLayer(prepared, attachTargetId, {
        kind: attachKind,
        src
      })
    );
    setAttachTargetId(null);
  }

  function onDelete(id: string) {
    const next = removeLayer(prepared, id);
    commit(next);
    if (activeLayerId === id) onSelectLayer(null);
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

  function patchActive(
    patch: Partial<
      Pick<PenPageLayer, 'backgroundColor' | 'textShadow' | 'blur'>
    >
  ) {
    if (!active) return;
    commit(patchLayerStyle(prepared, active.id, patch));
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
        {layersFrontFirst.map((layer, i) => {
          const selected = activeLayerId === layer.id;
          const dropTarget = Boolean(dragId && hoverId === layer.id && dragId !== layer.id);
          return (
            <li
              key={layer.id}
              data-layer-id={layer.id}
              className={`flex cursor-grab items-center gap-1 px-2 py-1.5 text-[12px] active:cursor-grabbing ${
                selected ? 'bg-neutral-100 font-bold text-black' : 'text-neutral-600 hover:bg-neutral-50'
              } ${dropTarget ? 'ring-1 ring-inset ring-black' : ''} ${
                dragId === layer.id ? 'opacity-50' : ''
              }`}
              onPointerDown={(e) => onRowPointerDown(e, layer.id)}
            >
              <span className="w-4 shrink-0 text-[10px] text-neutral-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{layerLabel(layer, i)}</span>
              <span className="shrink-0 text-[10px] uppercase text-neutral-400">{layer.kind}</span>
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

      {active && (
        <div className="shrink-0 space-y-2 border-t border-neutral-200 p-2.5 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Object</div>
          {active.kind === 'text' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="font-bold text-black hover:opacity-60"
                onClick={() => startAttach(active.id, 'image')}
              >
                Attach image…
              </button>
              <button
                type="button"
                className="font-bold text-black hover:opacity-60"
                onClick={() => startAttach(active.id, 'video')}
              >
                Attach video…
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="font-bold text-black hover:opacity-60"
              onClick={() => commit(clearLayerAttachment(prepared, active.id))}
            >
              Clear attachment (back to text)
            </button>
          )}
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Background</span>
            <input
              type="color"
              value={active.backgroundColor || '#ffffff'}
              onChange={(e) => patchActive({ backgroundColor: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-300"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Shadow</span>
            <input
              type="checkbox"
              checked={Boolean(active.textShadow)}
              onChange={(e) =>
                patchActive({
                  textShadow: e.target.checked ? '0 1px 3px rgba(0,0,0,0.45)' : undefined
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Blur</span>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={active.blur || 0}
              onChange={(e) => patchActive({ blur: Number(e.target.value) || undefined })}
              className="w-20"
            />
          </label>
        </div>
      )}

      <input
        ref={attachRef}
        type="file"
        accept={attachKind === 'image' ? 'image/*' : 'video/*'}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onAttachFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
