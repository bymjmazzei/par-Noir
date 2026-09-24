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
  tapToToggle = true
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
  videoStyle?: CSSProperties;
  poster?: string;
  syncKey?: string;
  tapToToggle?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const sessionKey = syncKey || `local:${src}`;

  useEffect(() => {
    const ctrl = acquirePenMediaController(sessionKey, src);
    ctrlRef.current = ctrl;
    const syncUi = () => {
      setPaused(ctrl.paused);
      setMuted(ctrl.muted);
      if (!scrubbing.current) setProgress(ctrl.progress);
    };
    syncUi();
    const unsub = ctrl.subscribe(syncUi);

    const el = videoRef.current;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    const align = () => {
      const m = ctrl.master;
      if (!el || !m.duration) return;
      if (Math.abs(el.currentTime - m.currentTime) > 0.35) {
        try {
          el.currentTime = m.currentTime;
        } catch {
          /* ignore seek race */
        }
      }
      if (m.paused && !el.paused) el.pause();
      if (!m.paused && el.paused) void el.play().catch(() => undefined);
    };

    if (el) {
      const stream = ctrl.mirrorStream();
      if (stream) {
        el.srcObject = stream;
        el.muted = true;
        void el.play().catch(() => undefined);
      } else {
        el.srcObject = null;
        el.src = src;
        el.muted = true;
        el.loop = true;
        align();
        syncTimer = setInterval(align, 200);
        ctrl.master.addEventListener('play', align);
        ctrl.master.addEventListener('pause', align);
        ctrl.master.addEventListener('seeked', align);
      }
    }

    return () => {
      unsub();
      if (syncTimer) clearInterval(syncTimer);
      ctrl.master.removeEventListener('play', align);
      ctrl.master.removeEventListener('pause', align);
      ctrl.master.removeEventListener('seeked', align);
      if (el) {
        el.pause();
        el.srcObject = null;
        el.removeAttribute('src');
        el.load();
      }
      ctrl.release();
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
    };
  }, [sessionKey, src]);

  const togglePlay = useCallback(() => {
    ctrlRef.current?.togglePlay();
  }, []);

  const toggleMute = useCallback((e: ReactPointerEvent | { stopPropagation(): void; preventDefault(): void }) => {
    e.stopPropagation();
    e.preventDefault();
    ctrlRef.current?.toggleMute();
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const ctrl = ctrlRef.current;
    const bar = barRef.current;
    if (!ctrl || !bar || !ctrl.master.duration) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    ctrl.seekRatio(t);
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

  const showBar = hover || seeking;
  const objectFit =
    (videoStyle?.objectFit as CSSProperties['objectFit'] | undefined) || 'contain';

  return (
    <div
      className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${className || ''}`}
      style={{ backgroundColor: 'transparent', ...style }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        if (!scrubbing.current) setHover(false);
      }}
    >
      <video
        ref={videoRef}
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
        autoPlay
        preload="metadata"
        draggable={false}
        onPointerDown={onVideoPointerDown}
      />
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.85))] hover:opacity-90"
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
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
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
          showBar ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
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
