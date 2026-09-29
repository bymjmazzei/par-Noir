/**
 * Left-pane media editor when an image/video object layer is selected.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  FULL_MEDIA_CROP,
  MEDIA_FILTER_PRESETS,
  attachMediaToLayer,
  clampMediaCrop,
  mergeMediaFilter,
  layerSampleTime,
  patchLayerStyle,
  upsertLayer,
  writeLayerAtPlayhead,
  type PenAudioTrack,
  type PenMediaCrop,
  type PenMediaFilter,
  type PenMediaMask,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { SectionTimeline } from './SectionTimeline';
import { LayerMediaContent } from './LayerMediaContent';
import { ColorSwatchButton } from './PanelValueControls';
import { probeMediaAspect } from '../services/penAttach';
import { resolvePenMediaSrc, ingestInlineMediaSrc, putLocalMedia } from '../services/penLocalMedia';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

type ToolTab = 'color' | 'filters' | 'crop' | 'mask' | 'brush' | 'tracks';

const TABS: Array<{ id: ToolTab; label: string }> = [
  { id: 'color', label: 'Grade' },
  { id: 'filters', label: 'Look' },
  { id: 'crop', label: 'Crop' },
  { id: 'mask', label: 'Mask' },
  { id: 'brush', label: 'Draw' },
  { id: 'tracks', label: 'Audio' }
];

function InspectorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  neutral,
  display,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  neutral?: number;
  display: string;
  onChange: (next: number) => void;
}) {
  const drifted = neutral !== undefined && value !== neutral;
  return (
    <label className="grid grid-cols-[5.75rem_minmax(0,1fr)_3.25rem] items-center gap-2">
      <span className="text-[13px] text-stone-600">{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full accent-stone-900"
      />
      <button
        type="button"
        className={`text-right text-[13px] tabular-nums ${
          drifted ? 'text-stone-900 hover:underline' : 'text-stone-500'
        }`}
        disabled={!drifted}
        onClick={() => {
          if (neutral !== undefined) onChange(neutral);
        }}
      >
        {display}
      </button>
    </label>
  );
}

function looksMatch(current: PenMediaFilter, preset: PenMediaFilter): boolean {
  const left = mergeMediaFilter(current);
  const right = mergeMediaFilter(preset);
  return (
    left.brightness === right.brightness &&
    left.contrast === right.contrast &&
    left.saturation === right.saturation &&
    left.hueRotate === right.hueRotate
  );
}

function frameStyle(layer: PenPageLayer): CSSProperties {
  const w = Math.max(1, layer.w);
  const h = Math.max(1, layer.h);
  return {
    aspectRatio: `${w} / ${h}`,
    height: 'min(16rem, 100%)',
    width: 'auto',
    maxWidth: '100%'
  };
}

function newTrackId(): string {
  return `aud_${Math.random().toString(36).slice(2, 10)}`;
}

export function MediaEditorPanel({
  layer,
  section,
  session,
  docId,
  contentWidthPx = 736,
  contentHeightPx = 976,
  playheadSec = 0,
  playing = false,
  onPlayhead,
  onPlaying,
  onSelectLayer,
  onSectionChange
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  session?: PenSession | null;
  docId?: string;
  contentWidthPx?: number;
  contentHeightPx?: number;
  /** When grade or crop already has keys, edits land on the key at this time. */
  playheadSec?: number;
  playing?: boolean;
  onPlayhead?: (time: number) => void;
  onPlaying?: (playing: boolean) => void;
  onSelectLayer?: (id: string) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const [tab, setTab] = useState<ToolTab>('color');
  const [cloudOpen, setCloudOpen] = useState(false);
  const [fileKind, setFileKind] = useState<'image' | 'video'>(
    layer.kind === 'video' ? 'video' : 'image'
  );
  const [licensedDraft, setLicensedDraft] = useState('');
  const audioPickRef = useRef<HTMLInputElement>(null);
  const filter = mergeMediaFilter(layer.mediaFilter);
  const crop = clampMediaCrop(layer.mediaCrop);
  const mask = (layer.mediaMask || 'none') as PenMediaMask;
  const tracks = layer.audioTracks || [];

  function patch(p: Parameters<typeof patchLayerStyle>[2]) {
    const current = section.layers?.find((item) => item.id === layer.id) || layer;
    const time = layerSampleTime(section, current, playheadSec);
    onSectionChange(upsertLayer(section, writeLayerAtPlayhead(current, time, p)));
  }

  function setFilter(next: PenMediaFilter) {
    patch({ mediaFilter: { ...filter, ...next } });
  }

  function setTracks(next: PenAudioTrack[]) {
    patch({ audioTracks: next.length ? next : undefined });
  }

  function patchTrack(id: string, partial: Partial<PenAudioTrack>) {
    setTracks(tracks.map((track) => (track.id === id ? { ...track, ...partial } : track)));
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

  async function addOwnAudio(file: File) {
    let src = '';
    if (docId) {
      const put = await putLocalMedia({ docId, blob: file });
      src = put.ref;
    } else {
      src = URL.createObjectURL(file);
    }
    setTracks([...tracks, { id: newTrackId(), src, gain: 100, offsetSec: 0 }]);
  }

  function addLicensed() {
    const id = licensedDraft.trim();
    if (!id) return;
    setTracks([...tracks, { id: newTrackId(), licensedDocId: id, gain: 100, offsetSec: 0 }]);
    setLicensedDraft('');
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
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              className={`rounded-full px-2.5 py-1 text-[13px] ${
                tab === item.id ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto rounded-full px-2.5 py-1 text-[13px] text-stone-700 hover:bg-stone-200"
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
        <div
          data-media-frame
          className="relative mx-auto overflow-hidden rounded border border-stone-300 bg-black"
          style={frameStyle(layer)}
        >
          {src ? (
            <LayerMediaContent layer={layer} docId={docId} session={session} />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-stone-400">No media</p>
          )}
        </div>

        {tab === 'color' && (
          <div className="space-y-2">
            {(
              [
                ['brightness', 'Brightness', 50, 150, 100, '%'],
                ['contrast', 'Contrast', 50, 150, 100, '%'],
                ['saturation', 'Saturation', 0, 200, 100, '%'],
                ['hueRotate', 'Hue', 0, 360, 0, '°']
              ] as const
            ).map(([key, label, min, max, neutral, unit]) => (
              <InspectorSlider
                key={key}
                label={label}
                min={min}
                max={max}
                neutral={neutral}
                value={filter[key]}
                display={`${filter[key]}${unit}`}
                onChange={(n) => setFilter({ [key]: n })}
              />
            ))}
            <InspectorSlider
              label="Opacity"
              min={0}
              max={100}
              neutral={100}
              value={layer.opacity ?? 100}
              display={`${layer.opacity ?? 100}%`}
              onChange={(n) => patch({ opacity: n })}
            />
            <InspectorSlider
              label="Blur"
              min={0}
              max={40}
              neutral={0}
              value={layer.blur ?? 0}
              display={`${layer.blur ?? 0}px`}
              onChange={(n) => patch({ blur: n || undefined })}
            />
          </div>
        )}

        {tab === 'filters' && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MEDIA_FILTER_PRESETS).map(([id, preset]) => {
              const selected = looksMatch(filter, preset);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  className={`rounded-full px-3 py-1 text-[13px] capitalize ${
                    selected ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 hover:bg-stone-200'
                  }`}
                  onClick={() => patch({ mediaFilter: { ...preset } })}
                >
                  {id}
                </button>
              );
            })}
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
          <div className="flex flex-wrap gap-1">
            {(['none', 'circle', 'rounded'] as PenMediaMask[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mask === m}
                className={`rounded-full px-3 py-1 text-[13px] capitalize ${
                  mask === m ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 hover:bg-stone-200'
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
            frame={frameStyle(layer)}
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

        {tab === 'tracks' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="rounded-full bg-stone-900 px-3 py-1 text-[13px] text-white"
                onClick={() => audioPickRef.current?.click()}
              >
                Add audio
              </button>
              <input
                ref={audioPickRef}
                type="file"
                accept="audio/*"
                aria-label="Add audio file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void addOwnAudio(file);
                }}
              />
              <input
                aria-label="Licensed audio doc"
                className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-[13px]"
                placeholder="Licensed doc id"
                value={licensedDraft}
                onChange={(e) => setLicensedDraft(e.target.value)}
              />
              <button
                type="button"
                className="rounded-full bg-white px-3 py-1 text-[13px] text-stone-700 hover:bg-stone-200"
                onClick={addLicensed}
              >
                Add licensed
              </button>
            </div>
            {tracks.map((track) => (
              <div key={track.id} className="space-y-2">
                <div className="truncate text-[13px] text-stone-700">
                  {track.licensedDocId || 'Audio'}
                </div>
                <InspectorSlider
                  label="Gain"
                  min={0}
                  max={100}
                  neutral={100}
                  value={track.gain ?? 100}
                  display={`${track.gain ?? 100}%`}
                  onChange={(n) => patchTrack(track.id, { gain: n })}
                />
                <InspectorSlider
                  label="Offset"
                  min={0}
                  max={120}
                  neutral={0}
                  value={track.offsetSec ?? 0}
                  display={`${track.offsetSec ?? 0}s`}
                  onChange={(n) => patchTrack(track.id, { offsetSec: n })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <SectionTimeline
        section={section}
        activeLayerId={layer.id}
        playheadSec={playheadSec}
        playing={playing}
        docId={docId}
        session={session}
        onPlayhead={onPlayhead || (() => undefined)}
        onPlaying={onPlaying || (() => undefined)}
        onSelectLayer={onSelectLayer || (() => undefined)}
        onSectionChange={onSectionChange}
      />

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
    <div className="space-y-2">
      {(
        [
          ['x', 'Left', 0, 90, 0],
          ['y', 'Top', 0, 90, 0],
          ['w', 'Width', 10, 100, 100],
          ['h', 'Height', 10, 100, 100]
        ] as const
      ).map(([key, label, min, max, neutral]) => (
        <InspectorSlider
          key={key}
          label={label}
          min={min}
          max={max}
          neutral={neutral}
          value={Math.round(crop[key] * 100)}
          display={`${Math.round(crop[key] * 100)}%`}
          onChange={(n) => onChange({ ...crop, [key]: n / 100 })}
        />
      ))}
      <button
        type="button"
        className="text-[13px] text-stone-600 hover:text-stone-900"
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
  frame,
  overlaySrc,
  onCommit,
  onClear
}: {
  src: string;
  kind: 'image' | 'video';
  frame: CSSProperties;
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

  const ratio = typeof frame.aspectRatio === 'string' ? frame.aspectRatio : '16 / 9';
  const [rw, rh] = ratio.split('/').map((n) => Number(n.trim()) || 1);

  return (
    <div className="space-y-2">
      <InspectorSlider
        label="Size"
        min={2}
        max={40}
        neutral={8}
        value={brushSize}
        display={`${brushSize}`}
        onChange={setBrushSize}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ColorSwatchButton label="Brush color" value={brushColor} onChange={setBrushColor} />
        <button
          type="button"
          className="rounded-full bg-stone-900 px-3 py-1 text-[13px] text-white"
          onClick={commit}
        >
          Apply strokes
        </button>
        <button
          type="button"
          className="rounded-full px-3 py-1 text-[13px] text-stone-700 hover:bg-stone-200"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div
        className="relative overflow-hidden rounded border border-stone-300 bg-neutral-900"
        style={frame}
      >
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
          width={Math.round(640 * (rw / Math.max(rw, rh)))}
          height={Math.round(640 * (rh / Math.max(rw, rh)))}
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
    </div>
  );
}
