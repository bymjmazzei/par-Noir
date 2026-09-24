/**
 * Rasterize a DOM page preview to JPEG — includes TipTap text + layout.
 *
 * Cross-origin images/CSS/fonts taint canvas.toBlob. We clone the live tree,
 * inline safe computed styles (so ProseMirror CSS is not lost inside SVG),
 * force system fonts, punch transparent video holes, and only keep blob:/data:
 * images before SVG foreignObject.
 */

const DEFAULT_MAX_EDGE = 1080;
const JPEG_QUALITY = 0.85;

const INLINE_STYLE_PROPS = [
  'display',
  'float',
  'clear',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'overflow',
  'overflow-x',
  'overflow-y',
  'color',
  'background-color',
  'opacity',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'text-indent',
  'white-space',
  'word-break',
  'overflow-wrap',
  'vertical-align',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'box-shadow',
  'z-index',
  'transform',
  'transform-origin',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-self',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
  'object-fit',
  'object-position',
  'clip-path',
  'shape-outside',
  'shape-margin',
  'writing-mode',
  'direction'
] as const;

function isSafeMediaUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function forceSystemFonts(root: HTMLElement): void {
  const stack = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  root.style.fontFamily = stack;
  root.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.style.fontFamily = stack;
  });
}

function shouldSkipInlineValue(prop: string, val: string): boolean {
  if (!val) return true;
  if (val === 'none' || val === 'auto' || val === 'static' || val === 'normal') return true;
  if (val === '0px' && (prop.startsWith('margin') || prop.startsWith('padding') || prop.startsWith('border'))) {
    return true;
  }
  if (prop === 'opacity' && val === '1') return true;
  if (prop === 'z-index' && val === 'auto') return true;
  return false;
}

/**
 * Copy layout/paint from the live tree onto the clone so foreignObject does not
 * depend on page stylesheets (invisible inside SVG-as-image).
 */
export function inlineSafeComputedStyles(liveRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const liveNodes = [liveRoot, ...Array.from(liveRoot.querySelectorAll('*'))] as Element[];
  const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))] as Element[];
  const n = Math.min(liveNodes.length, cloneNodes.length);
  for (let i = 0; i < n; i++) {
    const live = liveNodes[i];
    const clone = cloneNodes[i];
    if (!(live instanceof HTMLElement) || !(clone instanceof HTMLElement)) continue;
    const tag = live.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;
    const cs = getComputedStyle(live);
    const parts: string[] = [];
    for (const prop of INLINE_STYLE_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (shouldSkipInlineValue(prop, val)) continue;
      parts.push(`${prop}:${val}`);
    }
    const bgImg = cs.backgroundImage;
    if (bgImg && bgImg !== 'none' && /url\s*\(\s*['"]?(blob:|data:)/i.test(bgImg)) {
      parts.push(`background-image:${bgImg}`);
    }
    parts.push('font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif');
    clone.style.cssText = parts.join(';');
    clone.removeAttribute('class');
  }
}

/** Replace videos with transparent holes sized from the live layout. */
export function punchVideoHolesFromLive(liveRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const liveVideos = Array.from(liveRoot.querySelectorAll('video')) as HTMLVideoElement[];
  const cloneVideos = Array.from(cloneRoot.querySelectorAll('video')) as HTMLVideoElement[];
  const rootRect = liveRoot.getBoundingClientRect();
  const count = Math.min(liveVideos.length, cloneVideos.length);
  for (let i = 0; i < count; i++) {
    const live = liveVideos[i]!;
    const clone = cloneVideos[i]!;
    if (live.dataset.penMediaDrawable === '1') {
      clone.remove();
      continue;
    }
    const r = live.getBoundingClientRect();
    const cs = getComputedStyle(live);
    const ph = document.createElement('div');
    const floatVal = cs.float;
    const pos = cs.position;
    if (pos === 'absolute' || pos === 'fixed') {
      ph.style.cssText = [
        `position:${pos}`,
        `left:${Math.round(r.left - rootRect.left)}px`,
        `top:${Math.round(r.top - rootRect.top)}px`,
        `width:${Math.max(1, Math.round(r.width))}px`,
        `height:${Math.max(1, Math.round(r.height))}px`,
        'background:transparent',
        'opacity:0',
        'pointer-events:none',
        'margin:0'
      ].join(';');
    } else {
      ph.style.cssText = [
        'display:block',
        `width:${Math.max(1, Math.round(r.width))}px`,
        `height:${Math.max(1, Math.round(r.height))}px`,
        'background:transparent',
        'opacity:0',
        floatVal && floatVal !== 'none' ? `float:${floatVal}` : '',
        cs.shapeOutside !== 'none' ? `shape-outside:${cs.shapeOutside}` : '',
        cs.shapeMargin !== '0px' ? `shape-margin:${cs.shapeMargin}` : '',
        `margin:${cs.margin}`
      ]
        .filter(Boolean)
        .join(';');
    }
    clone.replaceWith(ph);
  }
  cloneRoot.querySelectorAll('video').forEach((v) => v.remove());
}

/** Strip remaining taint sources after styles are inlined. */
export function sanitizeCloneForRaster(clone: HTMLElement): void {
  clone.querySelectorAll('script, iframe, object, embed, link, style, canvas').forEach((n) =>
    n.remove()
  );

  clone.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement;
    const src = el.getAttribute('src') || '';
    el.removeAttribute('srcset');
    el.removeAttribute('crossorigin');
    if (src && isSafeMediaUrl(src)) {
      el.setAttribute('src', src);
      return;
    }
    const ph = document.createElement('div');
    ph.style.cssText = `display:inline-block;width:${el.width || 40}px;height:${
      el.height || 40
    }px;background:#e5e5e5;`;
    el.replaceWith(ph);
  });

  clone.querySelectorAll('picture, source').forEach((v) => v.remove());

  clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const bg = node.style?.backgroundImage || '';
    if (bg && /url\s*\(/i.test(bg) && !/url\s*\(\s*['"]?(blob:|data:)/i.test(bg)) {
      node.style.backgroundImage = 'none';
    }
  });

  forceSystemFonts(clone);
}

function measureEl(el: HTMLElement): { w: number; h: number } {
  const rect = el.getBoundingClientRect();
  return {
    w: Math.max(1, Math.round(rect.width || el.offsetWidth || 1)),
    h: Math.max(1, Math.round(rect.height || el.offsetHeight || 1))
  };
}

/**
 * Capture an HTMLElement (page preview) to a JPEG blob, including text.
 * Inlines live computed styles so TipTap prose survives without page CSS.
 */
export async function rasterizeElementToPosterBlob(
  el: HTMLElement,
  opts?: { maxEdge?: number; quality?: number; punchVideos?: boolean }
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? JPEG_QUALITY;
  const punchVideos = opts?.punchVideos !== false;
  const { w, h } = measureEl(el);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const clone = el.cloneNode(true) as HTMLElement;
  inlineSafeComputedStyles(el, clone);
  if (punchVideos) punchVideoHolesFromLive(el, clone);
  sanitizeCloneForRaster(clone);

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;overflow:hidden;pointer-events:none;opacity:0;`;
  host.appendChild(clone);
  document.body.appendChild(host);

  let svg = '';
  try {
    const serialized = new XMLSerializer().serializeToString(clone);
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
      <foreignObject width="100%" height="100%" x="0" y="0">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:0 0;background:#ffffff;font-family:system-ui,-apple-system,sans-serif;color:#111111;">
          ${serialized}
        </div>
      </foreignObject>
    </svg>`;
  } finally {
    host.remove();
  }

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

/**
 * Fallback when foreignObject taints: background + blob images + text via fillText.
 */
export async function rasterizeElementSafeStill(
  el: HTMLElement,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? JPEG_QUALITY;
  const { w, h } = measureEl(el);
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

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const raw = node.textContent || '';
    const text = raw.replace(/\s+/g, ' ');
    if (text.trim()) {
      const parent = node.parentElement;
      if (
        parent &&
        !parent.closest('video, script, style, [data-pen-media-drawable="1"]')
      ) {
        const cs = getComputedStyle(parent);
        if (cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects());
          ctx.fillStyle = cs.color || '#111111';
          ctx.textBaseline = 'top';
          const fontSize = Math.max(8, (parseFloat(cs.fontSize) || 14) * scale);
          ctx.font = `${cs.fontStyle || 'normal'} ${cs.fontWeight || '400'} ${fontSize}px system-ui, -apple-system, sans-serif`;
          if (rects.length <= 1 && rects[0]) {
            const r = rects[0];
            ctx.fillText(
              text.trim(),
              (r.left - rootRect.left) * scale,
              (r.top - rootRect.top) * scale,
              Math.max(4, r.width * scale)
            );
          } else {
            const words = text.trim().split(' ');
            let wi = 0;
            for (const r of rects) {
              if (wi >= words.length) break;
              let line = '';
              while (wi < words.length) {
                const trial = line ? `${line} ${words[wi]}` : words[wi]!;
                if (ctx.measureText(trial).width > r.width * scale && line) break;
                line = trial;
                wi += 1;
              }
              if (line) {
                ctx.fillText(
                  line,
                  (r.left - rootRect.left) * scale,
                  (r.top - rootRect.top) * scale,
                  Math.max(4, r.width * scale)
                );
              }
            }
          }
        }
      }
    }
    node = walker.nextNode();
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
