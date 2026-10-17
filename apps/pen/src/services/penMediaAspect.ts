/**
 * Media aspect helpers — cheap, cached, no full-file decode loops.
 */

const aspectCache = new Map<string, number>();

/** Natural width/height ratio for a playable media src (blob:/http:/data:). */
export function probeMediaAspect(
  src: string,
  kind: 'image' | 'video'
): Promise<number> {
  if (kind === 'image') {
    return new Promise((resolve) => {
      const cached = aspectCache.get(`img:${src}`);
      if (cached) {
        resolve(cached);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        const a = w > 0 && h > 0 ? w / h : 1;
        aspectCache.set(`img:${src}`, a);
        resolve(a);
      };
      img.onerror = () => resolve(1);
      img.src = src;
    });
  }
  return probeVideoDisplayAspect(src);
}

const VIDEO_METADATA_TIMEOUT_MS = 10_000;
const VIDEO_FALLBACK_ASPECT = 16 / 9;

/**
 * Display aspect. Browsers already apply the file's rotation to videoWidth/videoHeight
 * (a phone's 1920x1080 + 90° track reports 1080x1920), so no second rotation here.
 * Only measured values are cached; the fallback is not, so a slow load can re-probe.
 */
export async function probeVideoDisplayAspect(src: string): Promise<number> {
  const hit = aspectCache.get(`vid:${src}`);
  if (hit) return hit;

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, VIDEO_METADATA_TIMEOUT_MS);
    video.src = src;
    try {
      void video.load();
    } catch {
      finish();
    }
  });

  const aspect = videoDisplayAspect(video);
  try {
    video.removeAttribute('src');
    video.load();
  } catch {
    /* ignore */
  }
  if (aspect == null) return VIDEO_FALLBACK_ASPECT;
  aspectCache.set(`vid:${src}`, aspect);
  return aspect;
}

export function videoDisplayAspect(video: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>): number | null {
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  return w > 0 && h > 0 ? w / h : null;
}

export function cachedMediaAspect(src: string): number | null {
  return aspectCache.get(`vid:${src}`) ?? aspectCache.get(`img:${src}`) ?? null;
}
