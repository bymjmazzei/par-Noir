/**
 * Shared playhead for the video lane and every audio track on the layer.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { acquirePenMediaController, type PenMediaController } from '@par-noir/feed-tile';
import type { PenPageLayer } from '@par-noir/pen-protocol';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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
    if (playing && time >= offsetSec) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [resolved, gain, offsetSec, time, playing]);
  if (!resolved) return null;
  return <audio ref={audioRef} src={resolved} preload="metadata" />;
}

export function MediaTimeline({
  layer,
  docId,
  session,
  onRemove
}: {
  layer: PenPageLayer;
  docId?: string;
  session?: PenSession | null;
  onRemove: (id: string) => void;
}) {
  const tracks = layer.audioTracks || [];
  const isVideo = layer.kind === 'video' && Boolean(layer.videoSrc);
  const videoRef = layer.videoSrc || '';
  const { resolved: videoSrc } = useResolvedMediaSrc(isVideo ? videoRef : null, { docId, session });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(isVideo ? 0 : 30);
  const [playing, setPlaying] = useState(false);
  const ctrlRef = useRef<PenMediaController | null>(null);

  useEffect(() => {
    if (!isVideo || !videoSrc) return;
    const ctrl = acquirePenMediaController(`pen-layer:${layer.id}`, videoSrc);
    ctrlRef.current = ctrl;
    const sync = () => {
      const d = ctrl.master.duration;
      if (d && Number.isFinite(d)) setDuration(d);
      setTime(ctrl.master.currentTime || 0);
      setPlaying(!ctrl.paused);
    };
    sync();
    const unsub = ctrl.subscribe(sync);
    return () => {
      unsub();
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
      ctrl.release();
    };
  }, [isVideo, videoSrc, layer.id]);

  useEffect(() => {
    if (isVideo) return;
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isVideo, playing, duration]);

  function toggle() {
    if (isVideo && ctrlRef.current) {
      ctrlRef.current.togglePlay();
      return;
    }
    setPlaying((p) => !p);
  }

  function seekRatio(ratio: number) {
    const clamped = Math.min(1, Math.max(0, ratio));
    const t = clamped * Math.max(duration, 0.01);
    if (isVideo && ctrlRef.current) {
      ctrlRef.current.seekRatio(clamped);
      setTime(t);
      return;
    }
    setTime(t);
  }

  function onBarDown(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    seekRatio(ratio);
  }

  const span = Math.max(duration, 0.01);

  return (
    <div data-media-timeline className="space-y-1.5 rounded-md border border-stone-300 bg-white p-2">
      <div className="flex items-center gap-2 text-[11px] text-stone-600">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white"
          onClick={toggle}
        >
          {playing ? 'II' : '▶'}
        </button>
        <span>
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
      {isVideo && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Video</div>
          <div
            className="relative h-6 cursor-pointer rounded bg-stone-800"
            onPointerDown={onBarDown}
          >
            <div
              className="absolute bottom-0 top-0 w-px bg-white"
              style={{ left: `${(time / span) * 100}%` }}
            />
          </div>
        </div>
      )}
      {tracks.map((track) => {
        const offset = track.offsetSec || 0;
        const label = track.licensedDocId
          ? track.licensedDocId
          : track.src
            ? 'Audio'
            : 'Empty';
        return (
          <div key={track.id} data-audio-lane={track.id} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
              <span className="truncate font-semibold uppercase tracking-wide">
                {track.licensedDocId ? 'Licensed' : 'Audio'} · {label}
              </span>
              <button
                type="button"
                className="text-stone-400 hover:text-black"
                aria-label={`Remove ${track.id}`}
                onClick={() => onRemove(track.id)}
              >
                Remove
              </button>
            </div>
            <div
              className="relative h-6 cursor-pointer rounded bg-teal-900/80"
              onPointerDown={onBarDown}
            >
              <div
                className="absolute bottom-1 top-1 rounded bg-teal-300/80"
                style={{
                  left: `${(offset / span) * 100}%`,
                  width: `${Math.max(8, 100 - (offset / span) * 100)}%`
                }}
              />
              <div
                className="absolute bottom-0 top-0 w-px bg-white"
                style={{ left: `${(time / span) * 100}%` }}
              />
            </div>
            {track.src ? (
              <AudioLane
                src={track.src}
                docId={docId}
                session={session}
                gain={track.gain ?? 100}
                offsetSec={offset}
                time={time}
                playing={playing}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
