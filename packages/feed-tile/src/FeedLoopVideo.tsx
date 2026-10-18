/**
 * Gapless looping video for feed slides.
 * Two decoders share one src. The back one waits on frame 0, so a loop never waits on a seek:
 * MediaRecorder WebM has no seek index, and native `loop` stalls and blanks at the wrap.
 */

import { useEffect, useRef, type CSSProperties } from 'react';

export type FeedPlayback = {
  /** The slide is on screen. */
  active: boolean;
  /** The viewer tapped to pause. */
  paused: boolean;
  muted: boolean;
  /** Fires each time playback wraps to the start. */
  onLoop?: () => void;
};

export const DEFAULT_FEED_PLAYBACK: FeedPlayback = { active: true, paused: false, muted: true };

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/** HTMLMediaElement.HAVE_CURRENT_DATA: frame 0 is decoded and paintable. */
const HAVE_CURRENT_DATA = 2;
/** Paused back decoders never produce a new frame callback. */
const FIRST_FRAME_TIMEOUT_MS = 120;

function whenFrameShown(video: FrameVideo, done: () => void): void {
  let fired = false;
  const finish = () => {
    if (fired) return;
    fired = true;
    window.clearTimeout(timer);
    done();
  };
  const timer = window.setTimeout(finish, FIRST_FRAME_TIMEOUT_MS);
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(finish);
  } else {
    video.addEventListener('playing', finish, { once: true });
  }
}

/** Unmuted autoplay can be refused without a gesture; keep the picture moving. */
function playVideo(video: HTMLVideoElement): void {
  const result = video.play();
  if (!result || typeof result.catch !== 'function') return;
  result.catch((err: unknown) => {
    if ((err as { name?: string } | null)?.name !== 'NotAllowedError' || video.muted) return;
    video.muted = true;
    void video.play()?.catch?.(() => undefined);
  });
}

function stack(front: HTMLVideoElement, back: HTMLVideoElement): void {
  front.style.zIndex = '2';
  back.style.zIndex = '1';
}

export function FeedLoopVideo({
  src,
  poster,
  fit = 'contain',
  className,
  style,
  active,
  paused,
  muted,
  onLoop,
  onTime,
  onDimensions
}: {
  src: string;
  poster?: string;
  fit?: 'cover' | 'contain';
  className?: string;
  style?: CSSProperties;
  active: boolean;
  paused: boolean;
  muted: boolean;
  onLoop?: () => void;
  /** Current time of the visible decoder. */
  onTime?: (seconds: number) => void;
  onDimensions?: (width: number, height: number) => void;
}) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const frontRef = useRef<0 | 1>(0);
  const swappingRef = useRef(false);
  const wantRef = useRef({ playing: active && !paused, muted });
  wantRef.current = { playing: active && !paused, muted };
  const onLoopRef = useRef(onLoop);
  onLoopRef.current = onLoop;
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const onDimensionsRef = useRef(onDimensions);
  onDimensionsRef.current = onDimensions;

  const pair = (): [HTMLVideoElement, HTMLVideoElement] | null => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return null;
    return frontRef.current === 0 ? [a, b] : [b, a];
  };

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    frontRef.current = 0;
    swappingRef.current = false;
    stack(a, b);
    b.muted = true;

    const onEnded = (e: Event) => {
      const p = pair();
      if (!p || swappingRef.current) return;
      const [front, back] = p;
      if (e.currentTarget !== front) return;
      onLoopRef.current?.();
      if (back.readyState < HAVE_CURRENT_DATA) {
        try {
          front.currentTime = 0;
        } catch {
          /* ignore */
        }
        if (wantRef.current.playing) playVideo(front);
        return;
      }
      swappingRef.current = true;
      back.muted = wantRef.current.muted;
      if (wantRef.current.playing) playVideo(back);
      whenFrameShown(back, () => {
        swappingRef.current = false;
        frontRef.current = frontRef.current === 0 ? 1 : 0;
        stack(back, front);
        front.muted = true;
        front.pause();
        try {
          front.currentTime = 0;
        } catch {
          /* ignore */
        }
        if (!wantRef.current.playing) back.pause();
      });
    };
    const onTimeUpdate = (e: Event) => {
      const p = pair();
      if (!p || e.currentTarget !== p[0]) return;
      const t = p[0].currentTime;
      onTimeRef.current?.(Number.isFinite(t) ? t : 0);
    };
    const onMeta = () => {
      if (a.videoWidth > 0 && a.videoHeight > 0) {
        onDimensionsRef.current?.(a.videoWidth, a.videoHeight);
      }
    };
    for (const el of [a, b]) {
      el.addEventListener('ended', onEnded);
      el.addEventListener('timeupdate', onTimeUpdate);
    }
    a.addEventListener('loadedmetadata', onMeta);
    return () => {
      for (const el of [a, b]) {
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('timeupdate', onTimeUpdate);
      }
      a.removeEventListener('loadedmetadata', onMeta);
    };
    // pair reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const p = pair();
    if (!p) return;
    const [front, back] = p;
    front.muted = muted;
    back.muted = swappingRef.current ? muted : true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, src]);

  useEffect(() => {
    const p = pair();
    if (!p) return;
    const [front, back] = p;
    if (active && !paused) {
      playVideo(swappingRef.current ? back : front);
    } else {
      front.pause();
      back.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, src]);

  const videoStyle: CSSProperties = { objectFit: fit };
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className || ''}`}
      style={style}
      data-feed-loop-video=""
    >
      <video
        ref={aRef}
        src={src}
        poster={poster}
        className="absolute inset-0 h-full w-full"
        style={videoStyle}
        muted
        playsInline
        preload="auto"
        draggable={false}
      />
      <video
        ref={bRef}
        src={src}
        className="absolute inset-0 h-full w-full"
        style={videoStyle}
        muted
        playsInline
        preload="auto"
        draggable={false}
        aria-hidden
      />
    </div>
  );
}
