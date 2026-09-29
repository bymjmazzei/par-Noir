/**
 * Autoplay/loop video with tap-to-pause, hover scrub, and mute toggle.
 * Optional syncKey shares one decoded track + audio across multiple viewers
 * (media panel + live preview).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { acquirePenMediaController, type PenMediaController } from './penMediaController.js';

const TAP_SLOP_PX = 8;

function drawFitted(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  fit: CSSProperties['objectFit']
) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  ctx.clearRect(0, 0, width, height);
  if (!(vw > 0 && vh > 0)) return;
  const scale =
    fit === 'cover' || fit === 'fill'
      ? fit === 'fill'
        ? null
        : Math.max(width / vw, height / vh)
      : Math.min(width / vw, height / vh);
  const dw = scale == null ? width : vw * scale;
  const dh = scale == null ? height : vh * scale;
  ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M4.5 9v6h3.5l4.5 3.5V5.5L8 9H4.5z" />
        <path
          d="M16.5 9.5l4 4m0-4l-4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.5 9v6h3.5l4.5 3.5V5.5L8 9H4.5z" />
      <path
        d="M15.5 9.5a3.5 3.5 0 010 5M17.5 7a6 6 0 010 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function PenMediaPlayer({
  src,
  className,
  style,
  videoStyle,
  poster,
  /**
   * When set, all players with this key share one media track (play/pause/mute/seek).
   * Use a stable layer id so the media panel and live preview stay in lockstep.
   */
  syncKey,
  /**
   * When false, tap does not toggle play (live preview until the layer is
   * selected). Scrub still works on hover.
   */
  tapToToggle = true,
  /** Feed and gallery autoplay. The editor holds one frame until Play. */
  autoPlay = true
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
  videoStyle?: CSSProperties;
  poster?: string;
  syncKey?: string;
  tapToToggle?: boolean;
  autoPlay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<PenMediaController | null>(null);
  const scrubbing = useRef(false);
  const tapToToggleRef = useRef(tapToToggle);
  tapToToggleRef.current = tapToToggle;

  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const [hover, setHover] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const synced = Boolean(syncKey);
  const objectFit =
    (videoStyle?.objectFit as CSSProperties['objectFit'] | undefined) || 'contain';
  const objectFitRef = useRef(objectFit);
  objectFitRef.current = objectFit;

  useEffect(() => {
    if (syncKey) {
      const ctrl = acquirePenMediaController(syncKey, src, { autoPlay });
      ctrlRef.current = ctrl;
      const syncUi = () => {
        setPaused(ctrl.paused);
        setMuted(ctrl.muted);
        if (!scrubbing.current) setProgress(ctrl.progress);
      };
      syncUi();
      const unsub = ctrl.subscribe(syncUi);
      const canvas = canvasRef.current;
      let stopped = false;
      let raf = 0;
      const paint = () => {
        if (stopped || !canvas) return;
        const video = ctrl.master;
        if (video.readyState < 2) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round((rect.width || canvas.clientWidth || 1) * dpr));
        const height = Math.max(1, Math.round((rect.height || canvas.clientHeight || 1) * dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawFitted(ctx, video, width, height, objectFitRef.current);
      };
      const follow = () => {
        if (stopped) return;
        paint();
        const video = ctrl.master as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        };
        if (video.paused) return;
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(() => follow());
        } else {
          raf = requestAnimationFrame(follow);
        }
      };
      ctrl.master.addEventListener('loadeddata', follow);
      ctrl.master.addEventListener('seeked', follow);
      ctrl.master.addEventListener('play', follow);
      ctrl.master.addEventListener('pause', paint);
      if (ctrl.master.readyState >= 2) follow();
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
        ctrl.master.removeEventListener('loadeddata', follow);
        ctrl.master.removeEventListener('seeked', follow);
        ctrl.master.removeEventListener('play', follow);
        ctrl.master.removeEventListener('pause', paint);
        unsub();
        ctrl.release();
        if (ctrlRef.current === ctrl) ctrlRef.current = null;
      };
    }

    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onTime = () => {
      if (!el.duration || scrubbing.current) return;
      setProgress(el.currentTime / el.duration);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    setMuted(el.muted);
    setPaused(el.paused);
    if (autoPlay) void el.play().catch(() => undefined);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
    };
  }, [syncKey, src, autoPlay]);

  const togglePlay = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (ctrl) {
      ctrl.togglePlay();
      return;
    }
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const toggleMute = useCallback((e: ReactPointerEvent | { stopPropagation(): void; preventDefault(): void }) => {
    e.stopPropagation();
    e.preventDefault();
    const ctrl = ctrlRef.current;
    if (ctrl) {
      ctrl.toggleMute();
      return;
    }
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted && el.paused) void el.play().catch(() => undefined);
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const ctrl = ctrlRef.current;
    if (ctrl?.master.duration) {
      ctrl.seekRatio(t);
      setProgress(t);
      return;
    }
    const el = videoRef.current;
    if (!el?.duration) return;
    el.currentTime = t * el.duration;
    setProgress(t);
  }, []);

  const onScrubDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    scrubbing.current = true;
    setSeeking(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const onScrubMove = (e: ReactPointerEvent) => {
    if (!scrubbing.current) return;
    e.stopPropagation();
    seekFromClientX(e.clientX);
  };

  const onScrubUp = (e: ReactPointerEvent) => {
    if (!scrubbing.current) return;
    e.stopPropagation();
    scrubbing.current = false;
    setSeeking(false);
  };

  const onVideoPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if (!tapToToggleRef.current) return;
    if (scrubbing.current) return;

    const originX = e.clientX;
    const originY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > TAP_SLOP_PX) {
        moved = true;
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (moved || scrubbing.current) return;
      if (!tapToToggleRef.current) return;
      togglePlay();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  const showControls = hover || seeking;
  const { objectFit: _fit, ...paintStyle } = (videoStyle || {}) as CSSProperties & {
    objectFit?: CSSProperties['objectFit'];
  };

  return (
    <div
      className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${className || ''}`}
      style={{ backgroundColor: 'transparent', ...style }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        if (!scrubbing.current) setHover(false);
      }}
    >
      {synced ? (
        <canvas
          ref={canvasRef}
          data-pen-media-key={syncKey}
          className={`absolute inset-0 h-full w-full ${tapToToggle ? 'cursor-pointer' : ''}`}
          style={{ ...paintStyle, pointerEvents: 'auto' }}
          onPointerDown={onVideoPointerDown}
        />
      ) : (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className={`absolute inset-0 h-full w-full ${tapToToggle ? 'cursor-pointer' : ''}`}
          style={{
            objectFit,
            ...videoStyle,
            pointerEvents: 'auto'
          }}
          muted
          loop
          playsInline
          autoPlay={autoPlay}
          preload="auto"
          draggable={false}
          onPointerDown={onVideoPointerDown}
        />
      )}
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center text-white transition-opacity [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.85))] hover:opacity-90 ${
          showControls ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={toggleMute}
      >
        <SpeakerIcon muted={muted} />
      </button>
      {paused && (
        <button
          type="button"
          aria-label="Play"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
          tabIndex={-1}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
      <div
        ref={barRef}
        data-pen-scrub="1"
        className={`absolute bottom-3 left-0 right-3 z-10 px-2 transition-opacity ${
          showControls ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        onPointerCancel={onScrubUp}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-2 cursor-pointer rounded-full bg-white/35 shadow-sm">
          <div
            className="relative h-full rounded-full bg-white"
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
          >
            <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}
