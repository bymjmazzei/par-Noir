/**
 * Repaint a canvas mirror of a video: once per decoded frame while playing, a few rAFs
 * after pause/seek until a frame lands. Exactly one callback is pending at any time.
 */

type PumpVideo = {
  paused: boolean;
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** rAF retries while paused before a frame is drawable (~1.5s at 60Hz). */
const PAUSED_RETRY_FRAMES = 90;

export function startFramePump(
  video: PumpVideo,
  paint: () => boolean
): { kick: () => void; stop: () => void } {
  let stopped = false;
  let raf = 0;
  let vfc = 0;
  let waiting = 0;

  const cancelPending = () => {
    if (raf) cancelAnimationFrame(raf);
    if (vfc) video.cancelVideoFrameCallback?.(vfc);
    raf = 0;
    vfc = 0;
  };

  const follow = () => {
    raf = 0;
    vfc = 0;
    if (stopped) return;
    const drew = paint();
    if (video.paused) {
      if (drew) {
        waiting = 0;
        return;
      }
      waiting += 1;
      if (waiting > PAUSED_RETRY_FRAMES) return;
    } else {
      waiting = 0;
      if (typeof video.requestVideoFrameCallback === 'function') {
        vfc = video.requestVideoFrameCallback(follow);
        return;
      }
    }
    raf = requestAnimationFrame(follow);
  };

  return {
    kick: () => {
      if (stopped) return;
      waiting = 0;
      cancelPending();
      follow();
    },
    stop: () => {
      stopped = true;
      cancelPending();
    }
  };
}
