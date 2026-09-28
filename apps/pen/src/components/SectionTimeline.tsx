/**
 * Section clock. Each non-guide layer is a track. Keys live on the layer.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  applyTransitionPreset,
  defaultLayerName,
  layerSampleTime,
  resolveTimelineDuration,
  sampleLayerAt,
  toggleKeyframeAt,
  upsertLayer,
  wrapTime,
  type PenPageLayer,
  type PenSectionContent,
  type PenTransitionPreset
} from '@par-noir/pen-protocol';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function trackRows(section: PenSectionContent): Array<{ layer: PenPageLayer; depth: number }> {
  const layers = (section.layers || []).filter((layer) => layer.kind !== 'guide');
  const top = layers
    .filter((layer) => !layer.parentGroupId)
    .sort((a, b) => a.zIndex - b.zIndex);
  const rows: Array<{ layer: PenPageLayer; depth: number }> = [];
  for (const layer of top) {
    rows.push({ layer, depth: 0 });
    if (layer.kind !== 'group') continue;
    const kids = layers
      .filter((item) => item.parentGroupId === layer.id)
      .sort((a, b) => a.zIndex - b.zIndex);
    for (const kid of kids) rows.push({ layer: kid, depth: 1 });
  }
  return rows;
}

function rowDuration(section: PenSectionContent, layer: PenPageLayer, pageDuration: number): number {
  if (layer.kind === 'group' && layer.durationSec && layer.durationSec > 0) return layer.durationSec;
  if (layer.parentGroupId) {
    const group = (section.layers || []).find((item) => item.id === layer.parentGroupId);
    if (group?.durationSec && group.durationSec > 0) return group.durationSec;
  }
  return pageDuration;
}

function AudioLane({
  src,
  docId,
  session,
  gain,
  offsetSec,
  time,
  playing
}: {
  src: string;
  docId?: string;
  session?: PenSession | null;
  gain: number;
  offsetSec: number;
  time: number;
  playing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !resolved) return;
    el.volume = Math.min(1, Math.max(0, gain / 100));
    const at = Math.max(0, time - offsetSec);
    if (Math.abs(el.currentTime - at) > 0.35) {
      try {
        el.currentTime = at;
      } catch {
        /* ignore seek before metadata */
      }
    }
    if (playing && time >= offsetSec) void el.play().catch(() => undefined);
    else el.pause();
  }, [resolved, gain, offsetSec, time, playing]);
  if (!resolved) return null;
  return <audio ref={audioRef} src={resolved} preload="metadata" />;
}

export function SectionTimeline({
  section,
  activeLayerId,
  playheadSec,
  playing,
  docId,
  session,
  onPlayhead,
  onPlaying,
  onSelectLayer,
  onSectionChange
}: {
  section: PenSectionContent;
  activeLayerId: string | null;
  playheadSec: number;
  playing: boolean;
  docId?: string;
  session?: PenSession | null;
  onPlayhead: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  onSelectLayer: (id: string) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const duration = resolveTimelineDuration(section);
  const rows = trackRows(section);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const playheadRef = useRef(playheadSec);
  if (!playing) playheadRef.current = playheadSec;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(duration, playheadRef.current + dt);
      playheadRef.current = next;
      onPlayhead(next);
      if (next >= duration) {
        onPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, onPlayhead, onPlaying]);

  function seekRatio(ratio: number, rowDur: number) {
    const next = Math.min(rowDur, Math.max(0, ratio * rowDur));
    onPlaying(false);
    onPlayhead(next);
  }

  function onBarDown(e: ReactPointerEvent<HTMLDivElement>, rowDur: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    seekRatio(ratio, rowDur);
  }

  function toggleKey() {
    const layer = (section.layers || []).find((item) => item.id === activeLayerId);
    if (!layer || layer.kind === 'guide') return;
    const time = layerSampleTime(section, layer, playheadSec);
    onSectionChange(upsertLayer(section, toggleKeyframeAt(layer, time)));
  }

  function applyTransition(preset: PenTransitionPreset) {
    if (!activeLayerId || !partnerId) return;
    onSectionChange(applyTransitionPreset(section, activeLayerId, partnerId, preset, { atSec: playheadSec }));
  }

  function setGroupDuration(layer: PenPageLayer, value: number) {
    const durationSec = Number.isFinite(value) && value > 0 ? value : undefined;
    onSectionChange(upsertLayer(section, { ...layer, durationSec }));
  }

  function setTrim(layer: PenPageLayer, edge: 'in' | 'out', ratio: number) {
    const span = rowDuration(section, layer, duration);
    const at = Math.min(span, Math.max(0, ratio * span));
    if (edge === 'in') {
      const out = layer.outSec ?? span;
      onSectionChange(upsertLayer(section, { ...layer, inSec: Math.min(at, out) }));
      return;
    }
    const inn = layer.inSec ?? 0;
    onSectionChange(upsertLayer(section, { ...layer, outSec: Math.max(at, inn) }));
  }

  return (
    <div data-media-timeline className="shrink-0 border-t border-stone-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[11px] text-stone-600">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white"
          onClick={() => {
            if (!playing && playheadSec >= duration) onPlayhead(0);
            onPlaying(!playing);
          }}
        >
          {playing ? 'II' : '▶'}
        </button>
        <span>
          {formatTime(playheadSec)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          aria-label="Keyframe"
          title="Keyframe"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-stone-300 text-sm"
          onClick={toggleKey}
        >
          ◆
        </button>
        {(['cut', 'crossfade', 'slide'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={!activeLayerId || !partnerId}
            className="rounded border border-stone-300 px-2 py-1 capitalize enabled:hover:bg-stone-100 disabled:opacity-40"
            onClick={() => applyTransition(preset)}
          >
            {preset === 'crossfade' ? 'Fade' : preset}
          </button>
        ))}
      </div>
      <div className="max-h-40 space-y-1 overflow-auto px-2 pb-2">
        {rows.map(({ layer, depth }) => {
          const rowDur = rowDuration(section, layer, duration);
          const local = layer.kind === 'group' ? wrapTime(playheadSec, rowDur) : layerSampleTime(section, layer, playheadSec);
          const posed = sampleLayerAt(layer, local);
          const head = (local / Math.max(rowDur, 0.01)) * 100;
          const inn = layer.inSec ?? 0;
          const out = layer.outSec ?? rowDur;
          const keys = layer.motion?.keys || [];
          return (
            <div
              key={layer.id}
              data-track-row={layer.id}
              data-sampled-x={posed.x}
              className="space-y-0.5"
              style={{ paddingLeft: depth ? 12 : 0 }}
            >
              <div className="flex items-center gap-2 text-[10px] text-stone-500">
                <button
                  type="button"
                  className={`truncate font-semibold uppercase tracking-wide ${
                    layer.id === activeLayerId ? 'text-black' : ''
                  }`}
                  onClick={(e) => {
                    if (e.shiftKey) setPartnerId(layer.id);
                    else onSelectLayer(layer.id);
                  }}
                >
                  {defaultLayerName(layer, section.layers || [])}
                  {layer.id === partnerId ? ' · with' : ''}
                </button>
                {layer.kind === 'group' && (
                  <label className="ml-auto flex items-center gap-1 normal-case">
                    Loop
                    <input
                      aria-label={`Loop ${layer.id}`}
                      className="w-12 rounded border border-stone-300 px-1 py-0.5"
                      type="number"
                      min={0}
                      step={0.1}
                      value={layer.durationSec ?? ''}
                      onChange={(e) => setGroupDuration(layer, Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
              <div
                className="relative h-6 cursor-pointer rounded bg-stone-800"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
                  const edge = e.clientX - rect.left < 8 ? 'in' : rect.right - e.clientX < 8 ? 'out' : null;
                  if (edge && (layer.kind === 'image' || layer.kind === 'video')) {
                    setTrim(layer, edge, ratio);
                    return;
                  }
                  onBarDown(e, rowDur);
                }}
              >
                {(layer.kind === 'image' || layer.kind === 'video') && (
                  <div
                    className="absolute bottom-1 top-1 rounded bg-stone-500/80"
                    style={{
                      left: `${(inn / Math.max(rowDur, 0.01)) * 100}%`,
                      width: `${Math.max(4, ((out - inn) / Math.max(rowDur, 0.01)) * 100)}%`
                    }}
                  />
                )}
                {keys.map((key) => (
                  <span
                    key={`${layer.id}-${key.t}`}
                    data-keyframe={`${layer.id}:${key.t}`}
                    className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-amber-300"
                    style={{ left: `${(key.t / Math.max(rowDur, 0.01)) * 100}%` }}
                  />
                ))}
                <div className="absolute bottom-0 top-0 w-px bg-white" style={{ left: `${head}%` }} />
              </div>
              {(layer.audioTracks || []).map((track) => {
                const offset = track.offsetSec || 0;
                return (
                  <div key={track.id} data-audio-lane={track.id} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
                      <span className="truncate font-semibold uppercase tracking-wide">
                        {track.licensedDocId ? 'Licensed' : 'Audio'}
                      </span>
                      <button
                        type="button"
                        className="text-stone-400 hover:text-black"
                        aria-label={`Remove ${track.id}`}
                        onClick={() => {
                          const next = (layer.audioTracks || []).filter((item) => item.id !== track.id);
                          onSectionChange(
                            upsertLayer(section, { ...layer, audioTracks: next.length ? next : undefined })
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div
                      className="relative h-6 cursor-pointer rounded bg-teal-900/80"
                      onPointerDown={(e) => onBarDown(e, rowDur)}
                    >
                      <div
                        className="absolute bottom-1 top-1 rounded bg-teal-300/80"
                        style={{
                          left: `${(offset / Math.max(rowDur, 0.01)) * 100}%`,
                          width: `${Math.max(8, 100 - (offset / Math.max(rowDur, 0.01)) * 100)}%`
                        }}
                      />
                      <div className="absolute bottom-0 top-0 w-px bg-white" style={{ left: `${head}%` }} />
                    </div>
                    {track.src ? (
                      <AudioLane
                        src={track.src}
                        docId={docId}
                        session={session}
                        gain={track.gain ?? 100}
                        offsetSec={offset}
                        time={playheadSec}
                        playing={playing}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
