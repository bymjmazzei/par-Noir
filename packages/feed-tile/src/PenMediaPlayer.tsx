/**
 * Muted autoplay/loop video with tap-to-pause and hover scrub.
 * Shared by Pen canvas and feed-tile live preview.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';

export function PenMediaPlayer({
  src,
  className,
  style,
  videoStyle,
  poster,
  /** When true, pointer events pass through the video so a parent can drag/resize. */
  allowDragThrough = false,
  /** Display aspect after orientation (phone rotation). */
  onDisplayAspect
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
  /** Applied to the `<video>` element (e.g. filter, objectFit). */
  videoStyle?: CSSProperties;
  poster?: string;
  allowDragThrough?: boolean;
  onDisplayAspect?: (aspect: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const scrubbing = useRef(false);
  const aspectSent = useRef<string | null>(null);

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

  useEffect(() => {
    if (!onDisplayAspect) return;
    const v = videoRef.current;
    if (!v) return;
    aspectSent.current = null;
    let cancelled = false;

    const emit = async () => {
      if (cancelled || aspectSent.current === src) return;
      const codedW = v.videoWidth || 0;
      const codedH = v.videoHeight || 0;
      if (!(codedW > 0 && codedH > 0)) return;

      let aspect: number | null = null;

      // VideoFrame.displayWidth/Height — accounts for rotation when the UA supports it.
      try {
        const VF = (globalThis as unknown as { VideoFrame?: typeof VideoFrame }).VideoFrame;
        if (VF) {
          const frame = new VF(v);
          const w = frame.displayWidth || frame.codedWidth;
          const h = frame.displayHeight || frame.codedHeight;
          frame.close();
          if (w > 0 && h > 0) aspect = w / h;
        }
      } catch {
        /* ignore */
      }

      if (aspect == null) {
        try {
          if (typeof createImageBitmap === 'function') {
            const bmp = await createImageBitmap(v);
            if (bmp.width > 0 && bmp.height > 0) aspect = bmp.width / bmp.height;
            bmp.close();
          }
        } catch {
          /* ignore */
        }
      }
      if (aspect == null) aspect = codedW / codedH;
      if (cancelled || !(aspect > 0)) return;
      aspectSent.current = src;
      onDisplayAspect(aspect);
    };

    const onReady = () => {
      void emit();
    };
    v.addEventListener('loadeddata', onReady);
    if (v.readyState >= 2) onReady();
    return () => {
      cancelled = true;
      v.removeEventListener('loadeddata', onReady);
    };
  }, [src, onDisplayAspect]);
  const togglePlay = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
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
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit,
          pointerEvents: allowDragThrough ? 'none' : 'auto',
          ...videoStyle,
          ...(allowDragThrough ? { pointerEvents: 'none' } : {})
        }}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        draggable={false}
        onClick={allowDragThrough ? undefined : togglePlay}
        onPointerDown={
          allowDragThrough
            ? undefined
            : (e) => {
                e.stopPropagation();
              }
        }
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
        className={`absolute bottom-0 left-0 right-0 z-10 px-2 pb-2 transition-opacity ${
          showBar ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${allowDragThrough && showBar ? 'pointer-events-auto' : ''}`}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        onPointerCancel={onScrubUp}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 cursor-pointer rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
          />
        </div>
      </div>
    </div>
  );
}
