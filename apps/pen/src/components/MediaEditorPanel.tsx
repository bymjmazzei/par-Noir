/**
 * Left-pane media editor when an image/video object layer is selected.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  FULL_MEDIA_CROP,
  MEDIA_FILTER_PRESETS,
  attachMediaToLayer,
  clampMediaCrop,
  mediaCropEdges,
  mediaCropFromEdges,
  editorPlaybackSrc,
  mergeMediaFilter,
  publishPlaybackSrc,
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
import { peekPenMediaController } from '@par-noir/feed-tile';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { SectionTimeline } from './SectionTimeline';
import { LayerMediaContent } from './LayerMediaContent';
import { ColorSwatchButton } from './PanelValueControls';
import { probeMediaAspect } from '../services/penAttach';
import { buildReversedEditProxy, reverseProxyAllowed } from '../services/editProxy';
import { resolvePenMediaSrc, ingestInlineMediaSrc, putLocalMedia } from '../services/penLocalMedia';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

type ToolTab = 'basic' | 'color' | 'filters' | 'crop' | 'mask' | 'brush' | 'speed' | 'tracks';

const TABS: Array<{ id: ToolTab; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'color', label: 'Grade' },
  { id: 'filters', label: 'Look' },
  { id: 'crop', label: 'Crop' },
  { id: 'mask', label: 'Mask' },
  { id: 'brush', label: 'Draw' },
  { id: 'speed', label: 'Speed' },
  { id: 'tracks', label: 'Audio' }
];

const COLOR_ROWS: Array<[keyof PenMediaFilter, string, number, number, number]> = [
  ['temp', 'Temp', -100, 100, 0],
  ['tint', 'Tint', -100, 100, 0],
  ['saturation', 'Saturation', 0, 200, 100],
  ['exposure', 'Exposure', -100, 100, 0],
  ['brightness', 'Brightness', 50, 150, 100],
  ['contrast', 'Contrast', 50, 150, 100],
  ['highlight', 'Highlight', -100, 100, 0],
  ['shadow', 'Shadow', -100, 100, 0],
  ['whites', 'Whites', -100, 100, 0],
  ['blacks', 'Blacks', -100, 100, 0],
  ['brilliance', 'Brilliance', -100, 100, 0],
  ['sharpen', 'Sharpen', 0, 100, 0],
  ['clarity', 'Clarity', -100, 100, 0],
  ['particles', 'Particles', 0, 100, 0],
  ['fade', 'Fade', 0, 100, 0],
  ['vignette', 'Vignette', 0, 100, 0]
];

function activeText(on: boolean): string {
  return on ? 'font-semibold text-stone-700' : 'font-normal text-stone-400';
}

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
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return (
    <label className="grid grid-cols-[5.75rem_minmax(0,1fr)_3.25rem] items-center gap-2">
      <span className="text-[13px] text-stone-500">{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-stone-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-stone-500"
        style={{
          background: `linear-gradient(to right, #a8a29e ${pct}%, #e7e5e4 ${pct}%)`
        }}
      />
      <button
        type="button"
        className={`text-right text-[13px] tabular-nums ${
          drifted ? 'font-semibold text-stone-700' : 'text-stone-400'
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
    height: '12rem',
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
  const reversing = useRef(false);
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

  function hearClip(gain: number, muted: boolean) {
    peekPenMediaController(`pen-layer:${layer.id}`)?.setClipAudio(gain / 100, !muted);
  }

  async function onReverse() {
    if (layer.mediaReversed) {
      patch({ mediaReversed: false });
      return;
    }
    if (layer.reverseProxySrc) {
      patch({ mediaReversed: true });
      return;
    }
    if (reversing.current || !docId) return;
    const known = peekPenMediaController(`pen-layer:${layer.id}`)?.master.duration;
    if (typeof known === 'number' && Number.isFinite(known) && !reverseProxyAllowed(known)) return;
    const raw = editorPlaybackSrc({ ...layer, mediaReversed: false }) || publishPlaybackSrc(layer);
    if (!raw) return;
    reversing.current = true;
    try {
      const url = await resolvePenMediaSrc(raw, docId);
      if (!url) return;
      const ref = await buildReversedEditProxy({ docId, fileUrl: url });
      if (!ref) return;
      patch({ mediaReversed: true, reverseProxySrc: ref });
    } finally {
      reversing.current = false;
    }
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

  const attached = layer.kind === 'video' ? layer.videoSrc || layer.backgroundVideo : layer.imageSrc;
  const playbackRef = layer.kind === 'video' ? editorPlaybackSrc(layer) : attached;
  const { resolved: brushSrc } = useResolvedMediaSrc(playbackRef, { docId, session });
  const { resolved: brushOverlay } = useResolvedMediaSrc(layer.paintOverlaySrc, {
    docId,
    session
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-stone-100">
      <div className="shrink-0 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              className={`px-0.5 py-1 text-[13px] ${activeText(tab === item.id)}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto px-0.5 py-1 text-[13px] text-stone-500"
            onClick={() => {
              setFileKind(layer.kind === 'video' ? 'video' : 'image');
              setCloudOpen(true);
            }}
          >
            Replace…
          </button>
        </div>
      </div>

      <div
        data-media-frame
        className="relative mx-auto shrink-0 overflow-hidden bg-stone-200"
        style={frameStyle(layer)}
      >
          {attached ? (
            <LayerMediaContent layer={layer} docId={docId} session={session} />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-stone-400">No media</p>
          )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-3">
        <div hidden={tab !== 'basic'} className="space-y-2">
          <InspectorSlider
            label="Scale"
            min={10}
            max={300}
            neutral={100}
            value={layer.mediaScale ?? 100}
            display={`${layer.mediaScale ?? 100}%`}
            onChange={(n) => patch({ mediaScale: n })}
          />
          <InspectorSlider
            label="Position X"
            min={-100}
            max={100}
            neutral={0}
            value={layer.mediaX ?? 0}
            display={`${layer.mediaX ?? 0}%`}
            onChange={(n) => patch({ mediaX: n })}
          />
          <InspectorSlider
            label="Position Y"
            min={-100}
            max={100}
            neutral={0}
            value={layer.mediaY ?? 0}
            display={`${layer.mediaY ?? 0}%`}
            onChange={(n) => patch({ mediaY: n })}
          />
          <InspectorSlider
            label="Rotate"
            min={-180}
            max={180}
            neutral={0}
            value={layer.mediaRotate ?? 0}
            display={`${layer.mediaRotate ?? 0}°`}
            onChange={(n) => patch({ mediaRotate: n })}
          />
        </div>

        <div hidden={tab !== 'color'} className="space-y-2">
          <div className="space-y-2">
            {COLOR_ROWS.map(([key, label, min, max, neutral]) => (
              <InspectorSlider
                key={key}
                label={label}
                min={min}
                max={max}
                neutral={neutral}
                value={filter[key] ?? neutral}
                display={`${filter[key] ?? neutral}`}
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
        </div>

        {tab === 'filters' && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MEDIA_FILTER_PRESETS).map(([id, preset]) => {
              const selected = looksMatch(filter, preset);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  className={`px-1 py-1 text-[13px] capitalize ${activeText(selected)}`}
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

        <div hidden={tab !== 'mask'} className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {(['none', 'circle', 'rounded', 'rect'] as PenMediaMask[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mask === m}
                className={`px-1 py-1 text-[13px] capitalize ${activeText(mask === m)}`}
                onClick={() => patch({ mediaMask: m === 'none' ? undefined : m })}
              >
                {m === 'rounded' ? 'Rounded' : m === 'rect' ? 'Rectangle' : m}
              </button>
            ))}
          </div>
          <InspectorSlider
            label="Scale"
            min={10}
            max={300}
            neutral={100}
            value={layer.mediaMaskSize ?? 100}
            display={`${layer.mediaMaskSize ?? 100}%`}
            onChange={(n) => patch({ mediaMaskSize: n })}
          />
        </div>

        <div hidden={tab !== 'speed'} className="space-y-2">
          <InspectorSlider
            label="Speed"
            min={0.5}
            max={10}
            step={0.1}
            neutral={1}
            value={layer.playbackRate ?? 1}
            display={`${Math.round((layer.playbackRate ?? 1) * 10) / 10}×`}
            onChange={(n) => patch({ playbackRate: Math.round(n * 10) / 10 })}
          />
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={Boolean(layer.mediaMirror)}
              className={`px-1 py-1 text-[13px] ${activeText(Boolean(layer.mediaMirror))}`}
              onClick={() => patch({ mediaMirror: !layer.mediaMirror })}
            >
              Mirror
            </button>
            <button
              type="button"
              aria-pressed={Boolean(layer.mediaReversed)}
              className={`px-1 py-1 text-[13px] ${activeText(Boolean(layer.mediaReversed))}`}
              onClick={() => void onReverse()}
            >
              Reverse
            </button>
          </div>
        </div>

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

        <div hidden={tab !== 'tracks'} className="space-y-3">
          <div className="space-y-2">
            <div className="text-[13px] text-stone-700">Clip</div>
            <InspectorSlider
              label="Level"
              min={0}
              max={100}
              neutral={100}
              value={layer.mediaGain ?? 100}
              display={`${layer.mediaGain ?? 100}%`}
              onChange={(n) => {
                hearClip(n, false);
                patch({ mediaGain: n, mediaMuted: false });
              }}
            />
            <button
              type="button"
              aria-pressed={layer.mediaMuted !== false}
              className={`px-1 py-1 text-[13px] ${activeText(layer.mediaMuted !== false)}`}
              onClick={() => {
                const muted = layer.mediaMuted === false;
                hearClip(layer.mediaGain ?? 100, muted);
                patch({ mediaMuted: muted });
              }}
            >
              Mute
            </button>
          </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="px-1 py-1 text-[13px] font-semibold text-stone-700"
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
                className="min-w-0 flex-1 border border-stone-200 bg-stone-50 px-2 py-1 text-[13px] text-stone-700"
                placeholder="Licensed doc id"
                value={licensedDraft}
                onChange={(e) => setLicensedDraft(e.target.value)}
              />
              <button
                type="button"
                className="px-1 py-1 text-[13px] text-stone-500"
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
                  label="Level"
                  min={0}
                  max={100}
                  neutral={100}
                  value={track.gain ?? 100}
                  display={`${track.gain ?? 100}%`}
                  onChange={(n) => patchTrack(track.id, { gain: n, muted: false })}
                />
                <button
                  type="button"
                  aria-pressed={Boolean(track.muted)}
                  className={`px-1 py-1 text-[13px] ${activeText(Boolean(track.muted))}`}
                  onClick={() => patchTrack(track.id, { muted: !track.muted })}
                >
                  Mute
                </button>
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
  const edges = mediaCropEdges(crop);
  return (
    <div className="space-y-2">
      {(
        [
          ['top', 'Top'],
          ['bottom', 'Bottom'],
          ['left', 'Left'],
          ['right', 'Right']
        ] as const
      ).map(([edge, label]) => (
        <InspectorSlider
          key={edge}
          label={label}
          min={0}
          max={90}
          neutral={0}
          value={Math.round(edges[edge] * 100)}
          display={`${Math.round(edges[edge] * 100)}%`}
          onChange={(n) =>
            onChange(mediaCropFromEdges({ ...edges, [edge]: n / 100 }, edge))
          }
        />
      ))}
      <button
        type="button"
        className="text-[13px] text-stone-500"
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
          className="px-1 py-1 text-[13px] font-semibold text-stone-700"
          onClick={commit}
        >
          Apply strokes
        </button>
        <button
          type="button"
          className="px-1 py-1 text-[13px] text-stone-500"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div
        className="relative overflow-hidden bg-stone-200"
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
