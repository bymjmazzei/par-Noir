/**
 * One decoded media track shared by multiple PenMediaPlayer viewers.
 * The master <video> is the only decoder. Viewers paint it; they do not load the file.
 */

type Listener = () => void;

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

const registry = new Map<string, PenMediaController>();

export class PenMediaController {
  readonly key: string;
  readonly src: string;
  readonly master: HTMLVideoElement;
  /** When false, show one frame and stay paused until play(). */
  readonly autoPlay: boolean;
  private refCount = 0;
  private listeners = new Set<Listener>();
  private removed = false;
  private holdingFrame = false;
  private playbackWanted = false;

  muted = true;
  paused = true;
  progress = 0;

  constructor(key: string, src: string, autoPlay = true) {
    this.key = key;
    this.src = src;
    this.autoPlay = autoPlay;
    this.playbackWanted = autoPlay;
    const v = document.createElement('video');
    v.src = src;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      v.crossOrigin = 'anonymous';
    }
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.dataset.penMediaDrawable = '1';
    v.dataset.penMediaKey = key;
    // Offscreen. CSS size stays tiny so this element is not a full-res layer.
    v.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    this.master = v;

    const onTime = () => {
      if (!v.duration) return;
      this.progress = v.currentTime / v.duration;
      this.emit();
    };
    const onPlay = () => {
      this.paused = false;
      this.emit();
    };
    const onPause = () => {
      this.paused = true;
      this.emit();
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadeddata', () => {
      if (this.autoPlay) void this.ensurePlaying();
      else void this.holdFirstFrame();
    });
    if (this.autoPlay) void this.ensurePlaying();
  }

  acquire(): PenMediaController {
    this.refCount += 1;
    return this;
  }

  release(): void {
    this.refCount -= 1;
    if (this.refCount > 0) return;
    this.destroy();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private destroy(): void {
    if (this.removed) return;
    this.removed = true;
    if (registry.get(this.key) === this) registry.delete(this.key);
    try {
      this.master.pause();
    } catch {
      /* ignore */
    }
    this.master.removeAttribute('src');
    this.master.load();
    this.master.remove();
    this.listeners.clear();
  }

  /** Decode a single frame, then pause. Play after this is an explicit ensurePlaying. */
  private async holdFirstFrame(): Promise<void> {
    if (this.autoPlay || this.holdingFrame || this.removed) return;
    this.holdingFrame = true;
    const v = this.master as FrameVideo;
    try {
      await v.play();
      await new Promise<void>((resolve) => {
        if (typeof v.requestVideoFrameCallback === 'function') {
          v.requestVideoFrameCallback(() => resolve());
        } else {
          window.setTimeout(resolve, 48);
        }
      });
    } catch {
      /* frame unavailable */
    }
    if (this.removed || this.playbackWanted) return;
    try {
      v.pause();
    } catch {
      /* ignore */
    }
    this.paused = true;
    this.emit();
  }

  async ensurePlaying(): Promise<void> {
    this.playbackWanted = true;
    const v = this.master;
    v.muted = this.muted;
    try {
      await v.play();
      this.paused = false;
      this.emit();
    } catch {
      this.paused = true;
      this.emit();
    }
  }

  pause(): void {
    this.playbackWanted = false;
    try {
      this.master.pause();
    } catch {
      /* ignore */
    }
  }

  togglePlay(): void {
    const v = this.master;
    if (v.paused) {
      void this.ensurePlaying();
    } else {
      this.pause();
    }
  }

  setPlaybackRate(rate: number): void {
    const next = Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.5, rate)) : 1;
    if (this.master.playbackRate !== next) this.master.playbackRate = next;
  }

  /** Unmute only when the caller is the level or mute gesture. */
  setClipAudio(level: number, audible: boolean): void {
    this.master.volume = Math.min(1, Math.max(0, level));
    this.muted = !audible;
    this.master.muted = !audible;
    this.emit();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.master.muted = this.muted;
    if (!this.muted && this.master.paused) {
      void this.ensurePlaying();
    }
    this.emit();
  }

  seekRatio(ratio: number): void {
    const v = this.master;
    if (!v.duration) return;
    const t = Math.min(1, Math.max(0, ratio));
    v.currentTime = t * v.duration;
    this.progress = t;
    this.emit();
  }
}

/** The live controller for this key, if a viewer already started it. Does not create one. */
export function peekPenMediaController(key: string): PenMediaController | null {
  return registry.get(key) ?? null;
}

/** Ref-counted controller keyed for multi-viewer sync (e.g. layer id). */
export function acquirePenMediaController(
  key: string,
  src: string,
  opts?: { autoPlay?: boolean }
): PenMediaController {
  const existing = registry.get(key);
  if (existing && existing.src === src) {
    return existing.acquire();
  }
  // Src replaced for this key — unregister so new acquires get a fresh track.
  // Stale controllers stay alive until their viewers release.
  if (existing) {
    registry.delete(key);
  }
  const next = new PenMediaController(key, src, opts?.autoPlay !== false);
  registry.set(key, next);
  return next.acquire();
}
