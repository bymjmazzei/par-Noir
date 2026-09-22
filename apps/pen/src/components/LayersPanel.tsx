import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  createImageLayer,
  createTextLayer,
  createVideoLayer,
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

/** Photoshop-style stack: top of list = front. Drag rows to reorder. */
export function LayersPanel({
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange
}: {
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const prepared = useMemo(() => ensureDefaultTextLayer(normalizeSection(section)), [section]);
  const layersFrontFirst = useMemo(
    () => [...(prepared.layers || [])].sort((a, b) => b.zIndex - a.zIndex),
    [prepared.layers]
  );
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = layersFrontFirst.find((l) => l.id === activeLayerId) || null;

  function commit(next: PenSectionContent) {
    onSectionChange(next);
  }

  function maxZ() {
    return layersFrontFirst.reduce((m, l) => Math.max(m, l.zIndex), 0);
  }

  function addText() {
    const layer = createTextLayer({
      x: 12,
      y: 12 + (layersFrontFirst.length % 4) * 8,
      w: 50,
      h: 24,
      zIndex: maxZ() + 1
    });
    commit(upsertLayer(prepared, layer));
    onSelectLayer(layer.id);
    setAddOpen(false);
  }

  async function addImage(file: File) {
    const src = await readFileAsDataUrl(file);
    if (!src) return;
    const layer = createImageLayer(src, { zIndex: maxZ() + 1 });
    commit(upsertLayer(prepared, layer));
    onSelectLayer(layer.id);
    setAddOpen(false);
  }

  async function addVideo(file: File) {
    const src = await readFileAsDataUrl(file);
    if (!src) return;
    const layer = createVideoLayer(src, { zIndex: maxZ() + 1 });
    commit(upsertLayer(prepared, layer));
    onSelectLayer(layer.id);
    setAddOpen(false);
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
      Pick<
        PenPageLayer,
        'backgroundColor' | 'backgroundImage' | 'backgroundVideo' | 'textShadow' | 'blur'
      >
    >
  ) {
    if (!active) return;
    commit(patchLayerStyle(prepared, active.id, patch));
  }

  return (
    <div className="flex h-full min-h-0 w-56 shrink-0 flex-col border-l border-stone-300 bg-stone-100">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-stone-300 px-2 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Layers
        </span>
        <div className="relative">
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-50"
            onClick={() => setAddOpen((o) => !o)}
          >
            Add
          </button>
          {addOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[8rem] rounded border border-stone-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-stone-50"
                onClick={addText}
              >
                Text
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-stone-50"
                onClick={() => {
                  imageRef.current?.click();
                }}
              >
                Image…
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-stone-50"
                onClick={() => {
                  videoRef.current?.click();
                }}
              >
                Video…
              </button>
            </div>
          )}
        </div>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addImage(f);
            e.target.value = '';
          }}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addVideo(f);
            e.target.value = '';
          }}
        />
      </div>

      <ul
        className="min-h-0 flex-1 overflow-auto py-1"
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
                selected ? 'bg-sky-100 text-sky-950' : 'text-stone-700 hover:bg-stone-200/60'
              } ${dropTarget ? 'ring-1 ring-inset ring-sky-400' : ''} ${
                dragId === layer.id ? 'opacity-50' : ''
              }`}
              onPointerDown={(e) => onRowPointerDown(e, layer.id)}
            >
              <span className="w-4 shrink-0 text-[10px] text-stone-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{layerLabel(layer, i)}</span>
              <span className="shrink-0 text-[10px] uppercase text-stone-400">{layer.kind}</span>
              <button
                type="button"
                title="Delete layer"
                className="shrink-0 rounded px-1 text-stone-400 hover:bg-stone-300 hover:text-red-700"
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
        <div className="shrink-0 space-y-2 border-t border-stone-300 p-2 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-stone-500">Style</div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-stone-600">Background</span>
            <input
              type="color"
              value={active.backgroundColor || '#ffffff'}
              onChange={(e) => patchActive({ backgroundColor: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-stone-300"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-stone-600">Shadow</span>
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
            <span className="text-stone-600">Blur</span>
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
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 hover:bg-stone-50"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async () => {
                  const f = input.files?.[0];
                  if (!f) return;
                  const src = await readFileAsDataUrl(f);
                  patchActive({ backgroundImage: src, backgroundVideo: undefined });
                };
                input.click();
              }}
            >
              BG image…
            </button>
            <button
              type="button"
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 hover:bg-stone-50"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/*';
                input.onchange = async () => {
                  const f = input.files?.[0];
                  if (!f) return;
                  const src = await readFileAsDataUrl(f);
                  patchActive({ backgroundVideo: src, backgroundImage: undefined });
                };
                input.click();
              }}
            >
              BG video…
            </button>
            <button
              type="button"
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-stone-500 hover:bg-stone-50"
              onClick={() =>
                patchActive({
                  backgroundImage: undefined,
                  backgroundVideo: undefined,
                  backgroundColor: undefined
                })
              }
            >
              Clear fill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
