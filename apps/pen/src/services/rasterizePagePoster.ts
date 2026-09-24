/**
 * Rasterize a DOM page preview to JPEG for feedPoster — browse never needs author fonts.
 *
 * Cross-origin images/CSS in the tree taint the canvas (toBlob SecurityError).
 * We sanitize the clone to blob:/data: or placeholders before SVG foreignObject.
 */

const DEFAULT_MAX_EDGE = 1080;
const JPEG_QUALITY = 0.85;

function isSafeMediaUrl(src: string): boolean {
  return (
    src.startsWith('blob:') ||
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.startsWith('./')
  );
}

/** Strip or neutralize anything that would taint a canvas when foreignObject-rasterized. */
function sanitizeCloneForRaster(clone: HTMLElement): void {
  clone.querySelectorAll('script, iframe, object, embed, link').forEach((n) => n.remove());

  clone.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement;
    const src = el.currentSrc || el.getAttribute('src') || '';
    if (src && isSafeMediaUrl(src)) return;
    const ph = document.createElement('div');
    ph.style.cssText = `width:${el.width || el.clientWidth || 40}px;height:${
      el.height || el.clientHeight || 40
    }px;background:#e5e5e5;`;
    el.replaceWith(ph);
  });

  clone.querySelectorAll('video').forEach((v) => {
    const ph = document.createElement('div');
    ph.style.width = '100%';
    ph.style.height = '100%';
    ph.style.background = '#111';
    v.replaceWith(ph);
  });

  clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const bg = node.style?.backgroundImage || '';
    if (bg && /url\s*\(\s*['"]?https?:/i.test(bg)) {
      node.style.backgroundImage = 'none';
      if (!node.style.backgroundColor) node.style.backgroundColor = '#e5e5e5';
    }
  });
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

  // Wait for fonts used in the editor
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

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
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:0 0;">
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
