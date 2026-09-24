/**
 * Rasterize a DOM page preview to JPEG for feedPoster — browse never needs author fonts.
 *
 * Cross-origin images/CSS/fonts in the tree taint the canvas (toBlob SecurityError).
 * Sanitize the clone to blob:/data: only and force system fonts before SVG foreignObject.
 */

const DEFAULT_MAX_EDGE = 1080;
const JPEG_QUALITY = 0.85;

function isSafeMediaUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function forceSystemFonts(root: HTMLElement): void {
  root.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  root.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  });
}

/** Strip or neutralize anything that would taint a canvas when foreignObject-rasterized. */
export function sanitizeCloneForRaster(clone: HTMLElement): void {
  clone.querySelectorAll('script, iframe, object, embed, link, style, canvas').forEach((n) =>
    n.remove()
  );

  clone.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement;
    const src = el.currentSrc || el.getAttribute('src') || '';
    el.removeAttribute('srcset');
    el.removeAttribute('crossorigin');
    if (src && isSafeMediaUrl(src)) {
      el.setAttribute('src', src);
      return;
    }
    const ph = document.createElement('div');
    ph.style.cssText = `width:${el.width || el.clientWidth || 40}px;height:${
      el.height || el.clientHeight || 40
    }px;background:#e5e5e5;`;
    el.replaceWith(ph);
  });

  clone.querySelectorAll('video, picture, source').forEach((v) => {
    const ph = document.createElement('div');
    ph.style.width = '100%';
    ph.style.height = '100%';
    ph.style.background = '#111';
    v.replaceWith(ph);
  });

  clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const bg = node.style?.backgroundImage || '';
    if (bg && /url\s*\(/i.test(bg) && !/url\s*\(\s*['"]?(blob:|data:)/i.test(bg)) {
      node.style.backgroundImage = 'none';
      if (!node.style.backgroundColor) node.style.backgroundColor = '#e5e5e5';
    }
  });

  forceSystemFonts(clone);
}

/**
 * Capture an HTMLElement (page preview) to a JPEG blob.
 * Fonts must already be loaded in the document (platform catalog / Google Fonts link).
 */
export async function rasterizeElementToPosterBlob(
  el: HTMLElement,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? JPEG_QUALITY;
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || el.offsetWidth || 1));
  const h = Math.max(1, Math.round(rect.height || el.offsetHeight || 1));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const clone = el.cloneNode(true) as HTMLElement;
  sanitizeCloneForRaster(clone);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:0 0;font-family:system-ui,-apple-system,sans-serif;">
          ${new XMLSerializer().serializeToString(clone)}
        </div>
      </foreignObject>
    </svg>`;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('rasterize_image_failed'));
      i.src = url;
    });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('rasterize_toBlob_failed'))),
        'image/jpeg',
        quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('rasterize_canvas_tainted'));
    }
  });
  return blob;
}

/**
 * Untainted still: solid fill + blob:/data: images only (no foreignObject).
 * Used when SVG rasterize would taint; good enough for gallery fallbacks.
 */
export async function rasterizeElementSafeStill(
  el: HTMLElement,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? JPEG_QUALITY;
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || el.offsetWidth || 1));
  const h = Math.max(1, Math.round(rect.height || el.offsetHeight || 1));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const fill = getComputedStyle(el).backgroundColor;
  ctx.fillStyle =
    fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent' ? fill : '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  const rootRect = el.getBoundingClientRect();
  const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of imgs) {
    const src = img.currentSrc || img.src || '';
    if (!isSafeMediaUrl(src)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    try {
      const bmp = await createImageBitmap(img);
      ctx.drawImage(
        bmp,
        (r.left - rootRect.left) * scale,
        (r.top - rootRect.top) * scale,
        r.width * scale,
        r.height * scale
      );
      bmp.close?.();
    } catch {
      /* skip */
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('rasterize_toBlob_failed'))),
        'image/jpeg',
        quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('rasterize_canvas_tainted'));
    }
  });
}
