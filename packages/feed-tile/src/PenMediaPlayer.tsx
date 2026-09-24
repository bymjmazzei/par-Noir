/**
 * Muted autoplay/loop video with tap-to-pause and hover scrub timeline.
 * Shared by Pen canvas, media editor, and feed-tile live preview.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';

const TAP_SLOP_PX = 8;

export function PenMediaPlayer({
  src,
  className,
  style,
  videoStyle,
  poster,
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
  tapToToggle?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const scrubbing = useRef(false);
  const tapToToggleRef = useRef(tapToToggle);
  tapToToggleRef.current = tapToToggle;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!v.duration || scrubbing.current) return;
      setProgress(v.currentTime / v.duration);
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const tryPlay = () => {
      v.muted = true;
      void v.play().catch(() => {
        setPaused(true);
      });
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadeddata', tryPlay);
    tryPlay();
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadeddata', tryPlay);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = true;
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const v = videoRef.current;
    const bar = barRef.current;
    if (!v || !bar || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    v.currentTime = t * v.duration;
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

  /**
   * Arm tap-to-toggle on document capture so we still see pointerup after
   * LayoutSurface setPointerCapture on the layer frame (which steals video events).
   */
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

  // Scrubber only while hovering the media (or actively scrubbing).
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
        key={src}
        src={src}
        poster={poster}
        className={`absolute inset-0 h-full w-full ${tapToToggle ? 'cursor-pointer' : ''}`}
        style={{
          objectFit,
          ...videoStyle,
          pointerEvents: 'auto'
        }}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        draggable={false}
        onPointerDown={onVideoPointerDown}
      />
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
        // Sit above the SE resize handle so scale stays clickable.
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
