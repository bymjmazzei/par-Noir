/**
 * Single decoded frame for layout while a 720p edit proxy encodes.
 * Does not use PenMediaController.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { paintGradedFrame, type TonalGrade } from '@par-noir/feed-tile';

function drawFitted(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  fit: CSSProperties['objectFit']
): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!(vw > 0 && vh > 0)) return false;
  ctx.clearRect(0, 0, width, height);
  const scale =
    fit === 'cover' || fit === 'fill'
      ? fit === 'fill'
        ? null
        : Math.max(width / vw, height / vh)
      : Math.min(width / vw, height / vh);
  const dw = scale == null ? width : vw * scale;
  const dh = scale == null ? height : vh * scale;
  ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return true;
}

export function VideoLayoutStill({
  src,
  className,
  videoStyle,
  grade = null,
  placeholder
}: {
  src: string | null | undefined;
  className?: string;
  videoStyle?: CSSProperties;
  grade?: TonalGrade | null;
  /** Shown when src is missing or the frame is not decoded yet. */
  placeholder?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectFit =
    (videoStyle?.objectFit as CSSProperties['objectFit'] | undefined) || 'contain';

  useEffect(() => {
    if (!src) return;
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('playsinline', '');
    video.src = src;

    let cancelled = false;
    const paint = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas || video.readyState < 2 || !(video.videoWidth > 0)) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (grade && paintGradedFrame(canvas, video, width, height, objectFit, grade)) {
        return;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) drawFitted(ctx, video, width, height, objectFit);
    };

    const holdFrame = async () => {
      try {
        await video.play();
        await new Promise<void>((resolve) => {
          const v = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
          };
          if (typeof v.requestVideoFrameCallback === 'function') {
            v.requestVideoFrameCallback(() => resolve());
          } else {
            window.setTimeout(resolve, 48);
          }
        });
      } catch {
        /* metadata-only fallback */
      }
      if (!cancelled) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        paint();
      }
    };

    const onReady = () => {
      void holdFrame();
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('seeked', paint);

    const canvas = canvasRef.current;
    const observer =
      canvas &&
      new ResizeObserver(() => {
        paint();
      });
    if (canvas && observer) observer.observe(canvas);

    return () => {
      cancelled = true;
      observer?.disconnect();
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('seeked', paint);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, objectFit, grade]);

  if (!src && placeholder) {
    return (
      <div
        className={`absolute inset-0 bg-neutral-200/80 ${className || ''}`}
        aria-hidden
      />
    );
  }
  if (!src) return null;

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${className || ''}`}
      style={videoStyle}
    />
  );
}
