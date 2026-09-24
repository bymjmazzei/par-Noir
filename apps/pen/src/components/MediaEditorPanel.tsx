/**
 * Left-pane media editor when an image/video object layer is selected.
 */

import { useEffect, useRef, useState } from 'react';
import {
  FULL_MEDIA_CROP,
  MEDIA_FILTER_PRESETS,
  attachMediaToLayer,
  clampMediaCrop,
  mergeMediaFilter,
  patchLayerStyle,
  type PenMediaCrop,
  type PenMediaFilter,
  type PenMediaMask,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { LayerMediaContent } from './LayerMediaContent';
import { probeMediaAspect } from '../services/penAttach';
import { resolvePenMediaSrc, ingestInlineMediaSrc } from '../services/penLocalMedia';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

type ToolTab = 'color' | 'filters' | 'crop' | 'mask' | 'brush';

export function MediaEditorPanel({
  layer,
  section,
  session,
  docId,
  contentWidthPx = 736,
  contentHeightPx = 976,
  onSectionChange
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  session?: PenSession | null;
  docId?: string;
  contentWidthPx?: number;
  contentHeightPx?: number;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const [tab, setTab] = useState<ToolTab>('color');
  const [cloudOpen, setCloudOpen] = useState(false);
  const [fileKind, setFileKind] = useState<'image' | 'video'>(
    layer.kind === 'video' ? 'video' : 'image'
  );
  const filter = mergeMediaFilter(layer.mediaFilter);
  const crop = clampMediaCrop(layer.mediaCrop);
  const mask = (layer.mediaMask || 'none') as PenMediaMask;

  function patch(p: Parameters<typeof patchLayerStyle>[2]) {
    onSectionChange(patchLayerStyle(section, layer.id, p));
  }

  function setFilter(next: PenMediaFilter) {
    patch({ mediaFilter: { ...filter, ...next } });
  }

  async function onReplace(src: string, meta?: { blobUrl?: string }) {
    const kind = fileKind;
    const playable =
      meta?.blobUrl || (await resolvePenMediaSrc(src, docId)) || src;
    const aspect = await probeMediaAspect(playable, kind);
    onSectionChange(
      attachMediaToLayer(
        section,
        layer.id,
        kind === 'image' ? { kind: 'image', src } : { kind: 'video', src },
        {
          aspectRatio: aspect,
          pageWidth: contentWidthPx,
          pageHeight: contentHeightPx
        }
      )
    );
  }

  const src = layer.kind === 'video' ? layer.videoSrc : layer.imageSrc;
  const { resolved: brushSrc } = useResolvedMediaSrc(src, { docId, session });
  const { resolved: brushOverlay } = useResolvedMediaSrc(layer.paintOverlaySrc, {
    docId,
    session
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f3f3f3]">
      <div className="shrink-0 border-b border-stone-300 bg-stone-50 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Media · {layer.kind}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(
            [
              ['color', 'Color'],
              ['filters', 'Filters'],
              ['crop', 'Crop'],
              ['mask', 'Mask'],
              ['brush', 'Brush']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                tab === id ? 'bg-black text-white' : 'bg-white text-stone-600 hover:bg-stone-200'
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-bold text-stone-800 hover:bg-stone-200"
            onClick={() => {
              setFileKind(layer.kind === 'video' ? 'video' : 'image');
              setCloudOpen(true);
            }}
          >
            Replace…
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded border border-stone-300 bg-black">
          {src ? (
            <LayerMediaContent layer={layer} docId={docId} session={session} forceControls />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-stone-400">No media</p>
          )}
        </div>

        {tab === 'color' && (
          <div className="space-y-3 text-[11px]">
            {(
              [
                ['brightness', 'Brightness', 50, 150],
                ['contrast', 'Contrast', 50, 150],
                ['saturation', 'Saturation', 0, 200],
                ['hueRotate', 'Hue', 0, 360]
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key} className="block">
                <div className="mb-0.5 flex justify-between text-stone-500">
                  <span>{label}</span>
                  <span>
                    {filter[key]}
                    {key === 'hueRotate' ? '°' : '%'}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={filter[key]}
                  onChange={(e) => setFilter({ [key]: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
            ))}
            <label className="block">
              <div className="mb-0.5 flex justify-between text-stone-500">
                <span>Opacity</span>
                <span>{layer.opacity ?? 100}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={layer.opacity ?? 100}
                onChange={(e) => patch({ opacity: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block">
              <div className="mb-0.5 flex justify-between text-stone-500">
                <span>Blur</span>
                <span>{layer.blur ?? 0}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                value={layer.blur ?? 0}
                onChange={(e) => patch({ blur: Number(e.target.value) || undefined })}
                className="w-full"
              />
            </label>
          </div>
        )}

        {tab === 'filters' && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(MEDIA_FILTER_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-medium capitalize text-stone-700 hover:bg-stone-100"
                onClick={() => patch({ mediaFilter: { ...preset } })}
              >
                {id}
              </button>
            ))}
          </div>
        )}

        {tab === 'crop' && (
          <CropEditor
            crop={crop}
            onChange={(next) => patch({ mediaCrop: clampMediaCrop(next) })}
            onReset={() => patch({ mediaCrop: { ...FULL_MEDIA_CROP } })}
          />
        )}

        {tab === 'mask' && (
          <div className="flex flex-wrap gap-2">
            {(['none', 'circle', 'rounded'] as PenMediaMask[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`rounded px-3 py-1.5 text-[11px] font-medium capitalize ${
                  mask === m ? 'bg-black text-white' : 'border border-stone-300 bg-white text-stone-700'
                }`}
                onClick={() => patch({ mediaMask: m === 'none' ? undefined : m })}
              >
                {m === 'rounded' ? 'Rounded' : m}
              </button>
            ))}
          </div>
        )}

        {tab === 'brush' && brushSrc && (
          <BrushEditor
            src={brushSrc}
            kind={layer.kind === 'video' ? 'video' : 'image'}
            overlaySrc={brushOverlay || undefined}
            onCommit={(dataUrl) => {
              if (!docId) {
                patch({ paintOverlaySrc: dataUrl });
                return;
              }
              void ingestInlineMediaSrc({ docId, src: dataUrl }).then((ref) => {
                patch({ paintOverlaySrc: ref || undefined });
              });
            }}
            onClear={() => patch({ paintOverlaySrc: undefined })}
          />
        )}
      </div>

      <CloudFeedMediaPicker
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        session={session || null}
        kind={fileKind}
        docId={docId}
        onPickMediaSrc={(url, meta) => void onReplace(url, meta)}
      />
    </div>
  );
}

function CropEditor({
  crop,
  onChange,
  onReset
}: {
  crop: PenMediaCrop;
  onChange: (c: PenMediaCrop) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3 text-[11px]">
      <p className="text-stone-500">Drag insets to crop the media frame (0–100%).</p>
      {(
        [
          ['x', 'Left', 0, 0.9],
          ['y', 'Top', 0, 0.9],
          ['w', 'Width', 0.1, 1],
          ['h', 'Height', 0.1, 1]
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key} className="block">
          <div className="mb-0.5 flex justify-between text-stone-500">
            <span>{label}</span>
            <span>{Math.round(crop[key] * 100)}%</span>
          </div>
          <input
            type="range"
            min={min * 100}
            max={max * 100}
            value={Math.round(crop[key] * 100)}
            onChange={(e) =>
              onChange({ ...crop, [key]: Number(e.target.value) / 100 })
            }
            className="w-full"
          />
        </label>
      ))}
      <button
        type="button"
        className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-stone-700"
        onClick={onReset}
      >
        Reset crop
      </button>
    </div>
  );
}

function BrushEditor({
  src,
  kind,
  overlaySrc,
  onCommit,
  onClear
}: {
  src: string;
  kind: 'image' | 'video';
  overlaySrc?: string;
  onCommit: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState('#ff3b30');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (overlaySrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = overlaySrc;
    }
  }, [overlaySrc, src]);

  function paintAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    ctx.fillStyle = brushColor;
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  }

  function commit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCommit(canvas.toDataURL('image/png'));
  }

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-stone-500">
          Size
          <input
            type="range"
            min={2}
            max={40}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-1 text-stone-500">
          Color
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-stone-300"
          />
        </label>
        <button
          type="button"
          className="rounded bg-black px-2 py-1 text-white"
          onClick={commit}
        >
          Apply strokes
        </button>
        <button
          type="button"
          className="rounded border border-stone-300 bg-white px-2 py-1 text-stone-700"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded border border-stone-300 bg-neutral-900">
        {kind === 'video' ? (
          <video
            src={src}
            className="absolute inset-0 h-full w-full object-contain opacity-80"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-contain opacity-80"
            draggable={false}
          />
        )}
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            drawing.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            paintAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            paintAt(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
        />
      </div>
      <p className="text-stone-400">Paint on the canvas, then Apply strokes to save the overlay.</p>
    </div>
  );
}
