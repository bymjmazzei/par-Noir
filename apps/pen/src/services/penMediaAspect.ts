/**
 * Media aspect helpers — cheap, cached, no full-file decode loops.
 */

const aspectCache = new Map<string, number>();
const rotationCache = new Map<string, number>();

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

/**
 * Display aspect after orientation. Cached per src — never re-fetches/decodes.
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
    window.setTimeout(finish, 600);
    video.src = src;
    try {
      void video.load();
    } catch {
      finish();
    }
  });

  const oriented = await readOrientedAspect(video, src);
  try {
    video.removeAttribute('src');
    video.load();
  } catch {
    /* ignore */
  }
  const aspect = oriented ?? 16 / 9;
  aspectCache.set(`vid:${src}`, aspect);
  return aspect;
}

/**
 * Prefer oriented size. Never createImageBitmap / VideoFrame on the hot path —
 * those decode full frames and can lock the GPU when looped.
 */
export async function readOrientedAspect(
  video: HTMLVideoElement,
  cacheKey?: string
): Promise<number | null> {
  const key = cacheKey || video.currentSrc || video.src || '';
  if (key) {
    const hit = aspectCache.get(`vid:${key}`);
    if (hit) return hit;
  }

  const codedW = video.videoWidth || 0;
  const codedH = video.videoHeight || 0;
  if (!(codedW > 0 && codedH > 0)) return null;

  // Cheap: MP4 tkhd matrix from the first 512KB only (not the whole file).
  const rot = key ? await rotationDegreesFromSrc(key) : 0;
  const aspect =
    rot === 90 || rot === 270 ? codedH / codedW : codedW / codedH;

  if (key) aspectCache.set(`vid:${key}`, aspect);
  return aspect;
}

async function rotationDegreesFromSrc(src: string): Promise<number> {
  const cached = rotationCache.get(src);
  if (cached != null) return cached;

  try {
    const head = await fetchMediaHead(src, 512 * 1024);
    if (!head) {
      rotationCache.set(src, 0);
      return 0;
    }
    const rot = readMp4RotationDegrees(head);
    rotationCache.set(src, rot);
    return rot;
  } catch {
    rotationCache.set(src, 0);
    return 0;
  }
}

/** Read at most `maxBytes` from a media URL (Range or blob.slice). */
async function fetchMediaHead(
  src: string,
  maxBytes: number
): Promise<Uint8Array | null> {
  if (src.startsWith('blob:')) {
    const blob = await fetch(src).then((r) => r.blob());
    const slice = blob.slice(0, maxBytes);
    return new Uint8Array(await slice.arrayBuffer());
  }
  try {
    const res = await fetch(src, {
      headers: { Range: `bytes=0-${maxBytes - 1}` }
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
  } catch {
    return null;
  }
}

/** Read QuickTime/MPEG-4 tkhd matrix rotation (0 / 90 / 180 / 270). */
export function readMp4RotationDegrees(bytes: Uint8Array): number {
  const n = bytes.byteLength;
  for (let i = 0; i + 8 < n; i++) {
    if (
      bytes[i] === 0x74 &&
      bytes[i + 1] === 0x6b &&
      bytes[i + 2] === 0x68 &&
      bytes[i + 3] === 0x64
    ) {
      const version = bytes[i + 4] ?? 0;
      let o = i + 4 + 4; // skip version+flags
      if (version === 1) {
        o += 8 + 8 + 4 + 4 + 8 + 8;
      } else {
        o += 4 + 4 + 4 + 4 + 4 + 8;
      }
      o += 2 + 2 + 2 + 2; // layer, alternate_group, volume, reserved
      if (o + 16 > n) continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const a = view.getInt32(o);
      const b = view.getInt32(o + 4);
      const c = view.getInt32(o + 8);
      const d = view.getInt32(o + 12);
      if (a === 0 && d === 0) {
        if (b > 0 && c < 0) return 90;
        if (b < 0 && c > 0) return 270;
      }
      if (b === 0 && c === 0 && a < 0 && d < 0) return 180;
      return 0;
    }
  }
  return 0;
}

export function cachedMediaAspect(src: string): number | null {
  return aspectCache.get(`vid:${src}`) ?? aspectCache.get(`img:${src}`) ?? null;
}
