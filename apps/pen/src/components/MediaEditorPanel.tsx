/**
 * Left-pane media editor when an image/video object layer is selected.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  FULL_MEDIA_CROP,
  MEDIA_FILTER_PRESETS,
  applyCropWindow,
  attachMediaToLayer,
  clampMediaCrop,
  mediaFilterCss,
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
  type PenSectionContent,
  type TrackJoinPoint
} from '@par-noir/pen-protocol';
import { peekPenMediaController } from '@par-noir/feed-tile';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { AnimationPicker, SectionTimeline, TransitionSettings } from './SectionTimeline';
import { LayerMediaContent } from './LayerMediaContent';
import { probeMediaAspect } from '../services/penAttach';
import lookSwatch from '../assets/look-apple.jpg';
import { resolvePenMediaSrc, putLocalMedia } from '../services/penLocalMedia';
import type { PenSession } from '../services/penSession';

type ToolTab = 'basic' | 'color' | 'filters' | 'crop' | 'mask' | 'speed' | 'tracks' | 'animations' | 'transitions';

const TABS: Array<{ id: ToolTab; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'color', label: 'Grade' },
  { id: 'filters', label: 'Look' },
  { id: 'crop', label: 'Crop' },
  { id: 'mask', label: 'Mask' },
  { id: 'animations', label: 'Animations' },
  { id: 'transitions', label: 'Transitions' },
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

const ActiveSettingContext = createContext<{
  id: string | null;
  setId: (id: string) => void;
}>({ id: null, setId: () => undefined });

function InspectorSlider({
  label,
  settingId,
  value,
  min,
  max,
  step = 1,
  neutral,
  display,
  onChange
}: {
  label: string;
  settingId?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  neutral?: number;
  display: string;
  onChange: (next: number) => void;
}) {
  const { id: active, setId } = useContext(ActiveSettingContext);
  const key = settingId ?? label;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const open = active === key;
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));

  function commit(raw: string) {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
    setEditing(false);
  }

  return (
    <div className="min-w-0" data-setting-row={key}>
      <div className="flex h-5 items-center gap-1">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500"
          onClick={() => setId(key)}
        >
          {label}
        </button>
        {editing ? (
          <input
            aria-label={label}
            className="w-12 bg-transparent text-right text-[13px] tabular-nums text-stone-700 outline-none"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(draft);
            }}
          />
        ) : (
          <button
            type="button"
            className="text-[13px] tabular-nums text-stone-700"
            onClick={() => {
              setId(key);
              setDraft(String(value));
              setEditing(true);
            }}
          >
            {display}
          </button>
        )}
        <button
          type="button"
          aria-label={`Reset ${label}`}
          title={`Reset ${label}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-stone-400"
          onClick={() => {
            if (neutral !== undefined) onChange(neutral);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M10 6a4 4 0 1 1-1.2-2.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path d="M10 1.5V4H7.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      {open ? (
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-stone-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-stone-500"
          style={{
            background: `linear-gradient(to right, #a8a29e ${pct}%, #e7e5e4 ${pct}%)`
          }}
        />
      ) : null}
    </div>
  );
}

function looksMatch(current: PenMediaFilter, preset: PenMediaFilter): boolean {
  const left = mergeMediaFilter(current);
  const right = mergeMediaFilter(preset);
  return (
    ['brightness', 'contrast', 'saturation', 'hueRotate', 'temp', 'tint', 'fade', 'exposure'] as const
  ).every((key) => left[key] === right[key]);
}

function frameStyle(layer: PenPageLayer, fullPicture = false): CSSProperties {
  const crop = clampMediaCrop(layer.mediaCrop);
  const w = Math.max(1, fullPicture ? layer.w / crop.w : layer.w);
  const h = Math.max(1, fullPicture ? layer.h / crop.h : layer.h);
  return {
    aspectRatio: `${w} / ${h}`,
    width: `min(100cqw, calc(100cqh * ${w} / ${h}))`,
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%'
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
  onSectionChange,
  scopeGroupId = null,
  onEnterGroup
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
  scopeGroupId?: string | null;
  onEnterGroup?: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<ToolTab>('color');
  const [join, setJoin] = useState<TrackJoinPoint | null>(null);
  const selectJoin = useCallback((point: TrackJoinPoint | null) => {
    setJoin(point);
    setTab((current) => (point ? 'transitions' : current === 'transitions' ? 'color' : current));
  }, []);
  const [activeSetting, setActiveSetting] = useState<string | null>(null);
  useEffect(() => {
    if (!activeSetting) return;
    const openId = activeSetting;
    function onDoc(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(`[data-setting-row="${openId.replace(/"/g, '')}"]`)) {
        return;
      }
      setActiveSetting(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [activeSetting]);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [fileKind, setFileKind] = useState<'image' | 'video'>(
    layer.kind === 'video' ? 'video' : 'image'
  );
  const [licensedDraft, setLicensedDraft] = useState('');
  const audioPickRef = useRef<HTMLInputElement>(null);
  const cropBasis = useRef<PenPageLayer | null>(null);
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

  function onReverse() {
    patch({ mediaReversed: !layer.mediaReversed });
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
  const cropping = tab === 'crop';
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-stone-100">
      <div className="shrink-0 px-3">
        <div
          data-media-tabs
          className="flex h-7 flex-nowrap items-center gap-x-2 overflow-x-auto"
        >
          {TABS.map((item) => {
            const inactive = item.id === 'transitions' && !join;
            return (
            <button
              key={item.id}
              type="button"
              data-transition-tab={item.id === 'transitions' ? '' : undefined}
              disabled={inactive}
              aria-pressed={tab === item.id}
              className={`shrink-0 px-0.5 text-[12px] leading-none ${
                inactive ? 'text-stone-300' : activeText(tab === item.id)
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden px-3 [container-type:size]">
      <div
        data-media-frame
        className="relative overflow-hidden bg-stone-200"
        style={frameStyle(layer, cropping)}
      >
          {attached ? (
            <LayerMediaContent
              layer={cropping ? { ...layer, mediaCrop: undefined } : layer}
              docId={docId}
              session={session}
            />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-stone-400">No media</p>
          )}
          <button
            type="button"
            title="Replace"
            aria-label="Replace"
            className="absolute right-1 top-1 z-20 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-stone-600"
            onClick={() => {
              setFileKind(layer.kind === 'video' ? 'video' : 'image');
              setCloudOpen(true);
            }}
          >
            Replace…
          </button>
          {cropping && attached ? (
            <CropMarquee
              crop={crop}
              onBegin={() => {
                cropBasis.current = layer;
              }}
              onChange={(next) => {
                const basis = cropBasis.current ?? layer;
                patch(applyCropWindow(basis, next));
              }}
            />
          ) : null}
      </div>
      </div>

      <ActiveSettingContext.Provider value={{ id: activeSetting, setId: setActiveSetting }}>
      <div
        data-media-settings
        className="relative z-10 h-[5.75rem] max-h-[5.75rem] min-h-0 shrink overflow-y-auto px-3"
      >
        <div className={tab === 'basic' ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'hidden'}>
          <InspectorSlider
            label="Scale"
            settingId="picture-scale"
            min={10}
            max={300}
            neutral={100}
            value={layer.mediaScale ?? 100}
            display={`${layer.mediaScale ?? 100}%`}
            onChange={(n) => patch({ mediaScale: n })}
          />
          <InspectorSlider
            label="Position X"
            min={0}
            max={Math.max(contentWidthPx, Math.ceil(layer.x))}
            value={Math.round(layer.x)}
            display={`${Math.round(layer.x)}`}
            onChange={(n) => patch({ x: n })}
          />
          <InspectorSlider
            label="Position Y"
            min={0}
            max={Math.max(contentHeightPx, Math.ceil(layer.y))}
            value={Math.round(layer.y)}
            display={`${Math.round(layer.y)}`}
            onChange={(n) => patch({ y: n })}
          />
          <InspectorSlider
            label="Rotate"
            min={-180}
            max={180}
            neutral={0}
            value={layer.rotate ?? layer.mediaRotate ?? 0}
            display={`${layer.rotate ?? layer.mediaRotate ?? 0}°`}
            onChange={(n) => patch({ rotate: n })}
          />
        </div>

        <div className={tab === 'color' ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'hidden'}>
          <div className="contents">
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
          <LookTiles current={filter} onPick={(preset) => patch({ mediaFilter: { ...preset } })} />
        )}

        {tab === 'crop' && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <InspectorSlider
              label="Scale"
              settingId="crop-scale"
              min={10}
              max={300}
              neutral={100}
              value={layer.mediaScale ?? 100}
              display={`${layer.mediaScale ?? 100}%`}
              onChange={(n) => patch({ mediaScale: n })}
            />
            <button
              type="button"
              className="text-left text-[13px] text-stone-500"
              onClick={() => {
                cropBasis.current = null;
                patch(applyCropWindow(layer, { ...FULL_MEDIA_CROP }));
              }}
            >
              Reset crop
            </button>
          </div>
        )}

        <div className={tab === 'mask' ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'hidden'}>
          <div className="col-span-2 flex flex-wrap gap-1">
            {(
              [
                ['none', 'None'],
                ['circle', 'Circle'],
                ['rounded', 'Rounded'],
                ['rect', 'Rectangle'],
                ['split', 'Split'],
                ['filmstrip', 'Filmstrip'],
                ['text', 'Text']
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mask === m}
                className={`px-1 py-1 text-[13px] ${activeText(mask === m)}`}
                onClick={() => patch({ mediaMask: m === 'none' ? undefined : m })}
              >
                {label}
              </button>
            ))}
          </div>
          <InspectorSlider
            label="Scale"
            settingId="mask-scale"
            min={10}
            max={300}
            neutral={100}
            value={layer.mediaMaskSize ?? 100}
            display={`${layer.mediaMaskSize ?? 100}%`}
            onChange={(n) => patch({ mediaMaskSize: n })}
          />
          {mask === 'split' ? (
            <>
              <InspectorSlider
                label="Rotate"
                settingId="mask-rotate"
                min={0}
                max={360}
                neutral={0}
                value={layer.mediaMaskAngle ?? 0}
                display={`${layer.mediaMaskAngle ?? 0}°`}
                onChange={(n) => patch({ mediaMaskAngle: n })}
              />
              <InspectorSlider
                label="Fade"
                settingId="mask-fade"
                min={0}
                max={100}
                neutral={0}
                value={layer.mediaMaskFeather ?? 0}
                display={`${layer.mediaMaskFeather ?? 0}`}
                onChange={(n) => patch({ mediaMaskFeather: n })}
              />
            </>
          ) : null}
          {mask === 'text' ? (
            <label className="col-span-2 flex items-center gap-2 text-[13px] text-stone-500">
              Text
              <input
                aria-label="Mask text"
                className="min-w-0 flex-1 bg-transparent text-stone-700 outline-none"
                value={layer.mediaMaskText ?? 'Text'}
                onChange={(e) => patch({ mediaMaskText: e.target.value })}
              />
            </label>
          ) : null}
        </div>

        <div className={tab === 'speed' ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'hidden'}>
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
        </div>

        <div className={tab === 'animations' ? 'h-full min-w-0' : 'hidden'}>
          <AnimationPicker layer={layer} section={section} onSectionChange={onSectionChange} />
        </div>

        <div className={tab === 'transitions' && join ? 'h-full' : 'hidden'} data-transition-settings="">
          {join ? (
            <TransitionSettings
              join={join}
              section={section}
              onSectionChange={onSectionChange}
              onPreview={(time) => {
                onPlayhead?.(time);
                onPlaying?.(true);
              }}
            />
          ) : null}
        </div>

        <div className={tab === 'tracks' ? 'space-y-3' : 'hidden'}>
          <div className="space-y-2">
            <div className="text-[13px] text-stone-700">Clip</div>
            <InspectorSlider
              label="Level"
              settingId="clip-level"
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
                  settingId={`level-${track.id}`}
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
                  settingId={`offset-${track.id}`}
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
      </ActiveSettingContext.Provider>

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
        onReverse={() => void onReverse()}
        scopeGroupId={scopeGroupId}
        onEnterGroup={onEnterGroup}
        showAnimations={false}
        onJoinSelect={selectJoin}
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

function LookTiles({
  current,
  onPick
}: {
  current: PenMediaFilter;
  onPick: (preset: PenMediaFilter) => void;
}) {
  return (
    <div className="pen-editor-tiles">
      {Object.entries(MEDIA_FILTER_PRESETS).map(([id, preset]) => {
        const selected = looksMatch(current, preset);
        const filter = mediaFilterCss({ mediaFilter: preset });
        return (
          <button key={id} type="button" aria-pressed={selected} title={id} className="pen-editor-tile text-left" onClick={() => onPick(preset)}>
            <span className={`pen-editor-square bg-stone-300 ${selected ? 'outline outline-2 outline-stone-600' : ''}`}>
              <img
                src={lookSwatch}
                alt=""
                data-look-tile="square"
                className="h-full w-full object-cover"
                style={filter ? { filter } : undefined}
                draggable={false}
              />
            </span>
            <span className={`block h-3 shrink-0 truncate text-[10px] capitalize leading-3 ${activeText(selected)}`}>{id}</span>
          </button>
        );
      })}
    </div>
  );
}

function CropMarquee({
  crop,
  onBegin,
  onChange
}: {
  crop: PenMediaCrop;
  onBegin: () => void;
  onChange: (next: PenMediaCrop) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = clampMediaCrop(crop);

  function local(event: { clientX: number; clientY: number }) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)))
    };
  }

  function track(mode: string, origin: { x: number; y: number }, start: PenMediaCrop) {
    const move = (event: PointerEvent) => {
      const point = local(event);
      if (mode === 'draw') {
        onChange(
          clampMediaCrop({
            x: Math.min(origin.x, point.x),
            y: Math.min(origin.y, point.y),
            w: Math.abs(point.x - origin.x),
            h: Math.abs(point.y - origin.y)
          })
        );
        return;
      }
      if (mode === 'move') {
        onChange(
          clampMediaCrop({
            ...start,
            x: start.x + (point.x - origin.x),
            y: start.y + (point.y - origin.y)
          })
        );
        return;
      }
      const right = start.x + start.w;
      const bottom = start.y + start.h;
      let x = start.x;
      let y = start.y;
      let w = start.w;
      let h = start.h;
      if (mode.includes('w')) {
        x = Math.min(point.x, right - 0.05);
        w = right - x;
      }
      if (mode.includes('e')) w = Math.max(0.05, point.x - start.x);
      if (mode.includes('n')) {
        y = Math.min(point.y, bottom - 0.05);
        h = bottom - y;
      }
      if (mode.includes('s')) h = Math.max(0.05, point.y - start.y);
      onChange(clampMediaCrop({ x, y, w, h }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div
      ref={ref}
      className="absolute inset-0"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).dataset.cropHandle) return;
        onBegin();
        const point = local(event);
        const full = box.w > 0.98 && box.h > 0.98 && box.x < 0.02 && box.y < 0.02;
        const inside =
          !full && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
        track(inside ? 'move' : 'draw', point, box);
      }}
    >
      <div
        className="absolute border border-stone-600"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          boxShadow: '0 0 0 999px rgba(120,113,108,0.45)'
        }}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
          <button
            key={handle}
            type="button"
            data-crop-handle={handle}
            aria-label={`Crop ${handle}`}
            title={`Crop ${handle}`}
            className="absolute z-10 h-2.5 w-2.5 bg-stone-600"
            style={{
              left: handle.includes('e') ? '100%' : 0,
              top: handle.includes('s') ? '100%' : 0,
              transform: 'translate(-50%, -50%)'
            }}
            onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              event.preventDefault();
              onBegin();
              track(handle, local(event), box);
            }}
          />
        ))}
      </div>
    </div>
  );
}
