/**
 * Rasterize a DOM page preview to JPEG for feedPoster — browse never needs author fonts.
 */

const DEFAULT_MAX_EDGE = 1080;
const JPEG_QUALITY = 0.85;

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
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
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

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:0 0;">
          ${new XMLSerializer().serializeToString(el.cloneNode(true) as Element)}
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
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('rasterize_toBlob_failed'))),
      'image/jpeg',
      quality
    );
  });
  return blob;
}
