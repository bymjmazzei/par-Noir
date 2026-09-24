/**
 * One decoded media track shared by multiple PenMediaPlayer viewers.
 * Master <video> owns playback + audio; viewers mirror via captureStream
 * (or a muted src-synced fallback).
 */

type Listener = () => void;

type CaptureVideo = HTMLVideoElement & {
  captureStream?: (frameRate?: number) => MediaStream;
  mozCaptureStream?: (frameRate?: number) => MediaStream;
};

const registry = new Map<string, PenMediaController>();

export class PenMediaController {
  readonly key: string;
  readonly src: string;
  readonly master: HTMLVideoElement;
  private refCount = 0;
  private listeners = new Set<Listener>();
  private stream: MediaStream | null = null;
  private removed = false;

  muted = true;
  paused = true;
  progress = 0;

  constructor(key: string, src: string) {
    this.key = key;
    this.src = src;
    const v = document.createElement('video') as CaptureVideo;
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
    // Keep in DOM so the decoder/audio graph stay alive; not shown.
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
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth > 0) v.width = v.videoWidth;
      if (v.videoHeight > 0) v.height = v.videoHeight;
    });
    v.addEventListener('loadeddata', () => {
      void this.ensurePlaying();
    });
    void this.ensurePlaying();
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
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.listeners.clear();
  }

  mirrorStream(): MediaStream | null {
    if (this.stream) return this.stream;
    const v = this.master as CaptureVideo;
    try {
      const raw = v.captureStream?.(30) ?? v.mozCaptureStream?.(30) ?? null;
      if (!raw) {
        this.stream = null;
        return null;
      }
      // Video-only mirror — master keeps the single audio track.
      const videoTracks = raw.getVideoTracks();
      this.stream = videoTracks.length ? new MediaStream(videoTracks) : raw;
    } catch {
      this.stream = null;
    }
    return this.stream;
  }

  async ensurePlaying(): Promise<void> {
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

  togglePlay(): void {
    const v = this.master;
    if (v.paused) {
      void this.ensurePlaying();
    } else {
      v.pause();
    }
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

/** Ref-counted controller keyed for multi-viewer sync (e.g. layer id). */
export function acquirePenMediaController(key: string, src: string): PenMediaController {
  const existing = registry.get(key);
  if (existing && existing.src === src) {
    return existing.acquire();
  }
  // Src replaced for this key — unregister so new acquires get a fresh track.
  // Stale controllers stay alive until their viewers release.
  if (existing) {
    registry.delete(key);
  }
  const next = new PenMediaController(key, src);
  registry.set(key, next);
  return next.acquire();
}
