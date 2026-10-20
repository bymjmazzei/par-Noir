/**
 * Rasterize a DOM page preview to JPEG — includes TipTap text + layout.
 *
 * Cross-origin images/CSS/fonts taint canvas.toBlob. We clone the live tree,
 * inline safe computed styles (so ProseMirror CSS is not lost inside SVG),
 * force system fonts, punch transparent video holes, and only keep blob:/data:
 * images before SVG foreignObject.
 */

import { sanitizeWidgetMarkup } from '@par-noir/pen-protocol';

const DEFAULT_MAX_EDGE = 1080;
const JPEG_QUALITY = 0.85;

const INLINE_STYLE_PROPS = [
  'zoom',
  'display',
  'visibility',
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
  if ((prop === 'opacity' || prop === 'zoom') && val === '1') return true;
  if (prop === 'z-index' && val === 'auto') return true;
  return false;
}

/**
 * A computed background-image that can be drawn without tainting the canvas:
 * gradients and blob:/data: urls. Any other url (remote images) taints toBlob.
 */
export function safeBackgroundImage(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  if (!v || v === 'none') return null;
  const urls = v.match(/url\s*\([^)]*\)/gi) || [];
  return urls.every((u) => /url\s*\(\s*['"]?(blob:|data:)/i.test(u)) ? v : null;
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
    const bgImg = safeBackgroundImage(cs.backgroundImage);
    if (bgImg) parts.push(`background-image:${bgImg}`);
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
  const scale = visualScale(liveRoot);
  const count = Math.min(liveVideos.length, cloneVideos.length);
  for (let i = 0; i < count; i++) {
    const live = liveVideos[i]!;
    const clone = cloneVideos[i]!;
    if (live.dataset.penMediaDrawable === '1') {
      clone.remove();
      continue;
    }
    const vr = live.getBoundingClientRect();
    const r = {
      left: rootRect.left + (vr.left - rootRect.left) / scale,
      top: rootRect.top + (vr.top - rootRect.top) / scale,
      width: vr.width / scale,
      height: vr.height / scale
    };
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

const SNIPPET_SELECTOR = 'iframe[data-pen-html-snippet]';
const snippetStills = new Map<string, string>();

/** Snippet markup drawn on its own SVG, as a PNG data URL (cached per markup and size). */
export async function snippetStillDataUrl(html: string, w: number, h: number): Promise<string> {
  const key = `${w}x${h}:${html}`;
  const cached = snippetStills.get(key);
  if (cached) return cached;
  const parsed = new DOMParser().parseFromString(sanitizeWidgetMarkup(html), 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, link').forEach((n) => n.remove());
  parsed.documentElement.setAttribute('style', `width:${w}px;height:${h}px;`);
  const xhtml = new XMLSerializer().serializeToString(parsed.documentElement);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('snippet_raster_failed'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    const data = canvas.toDataURL('image/png');
    snippetStills.set(key, data);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sandboxed snippet frames cannot be serialized; swap each for a still of its markup. */
export async function inlineHtmlSnippets(liveRoot: HTMLElement, cloneRoot: HTMLElement): Promise<void> {
  const live = Array.from(liveRoot.querySelectorAll<HTMLIFrameElement>(SNIPPET_SELECTOR));
  const clones = Array.from(cloneRoot.querySelectorAll<HTMLIFrameElement>(SNIPPET_SELECTOR));
  for (let i = 0; i < Math.min(live.length, clones.length); i++) {
    const frame = live[i]!;
    const clone = clones[i]!;
    // Layout size, not the on-screen rect: a group-scaled frame is zoomed, and the clone zooms the still too.
    const rect = frame.getBoundingClientRect();
    const w = Math.max(1, Math.round(frame.offsetWidth || rect.width));
    const h = Math.max(1, Math.round(frame.offsetHeight || rect.height));
    try {
      const img = document.createElement('img');
      img.src = await snippetStillDataUrl(frame.getAttribute('srcdoc') || '', w, h);
      img.alt = '';
      img.style.cssText = `${clone.style.cssText};display:block;width:100%;height:100%;border:0;`;
      clone.replaceWith(img);
    } catch {
      /* frame is dropped by sanitizeCloneForRaster */
    }
  }
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

/** Layout px, unaffected by ancestor transforms; the clone is laid out from computed styles in these units. */
function measureEl(el: HTMLElement): { w: number; h: number } {
  const rect = el.getBoundingClientRect();
  return {
    w: Math.max(1, Math.round(el.offsetWidth || rect.width || 1)),
    h: Math.max(1, Math.round(el.offsetHeight || rect.height || 1))
  };
}

/** On-screen px per layout px (preview zoom). Divide client rects by this to get layout px. */
export function visualScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  return el.offsetWidth > 0 && rect.width > 0 ? rect.width / el.offsetWidth : 1;
}

export type RasterSizeOpts = {
  maxEdge?: number;
  /** Exact output pixels; may upscale past the on-screen size (export at CDN resolution). */
  targetWidth?: number;
  targetHeight?: number;
};

/** Output canvas size and per-axis scale from on-screen CSS px. */
export function rasterOutputSize(
  w: number,
  h: number,
  opts?: RasterSizeOpts
): { cw: number; ch: number; sx: number; sy: number } {
  if (opts?.targetWidth && opts?.targetHeight) {
    const cw = Math.max(1, Math.round(opts.targetWidth));
    const ch = Math.max(1, Math.round(opts.targetHeight));
    return { cw, ch, sx: cw / w, sy: ch / h };
  }
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    cw: Math.max(1, Math.round(w * scale)),
    ch: Math.max(1, Math.round(h * scale)),
    sx: scale,
    sy: scale
  };
}

/**
 * Capture an HTMLElement (page preview) to a JPEG blob, including text.
 * Inlines live computed styles so TipTap prose survives without page CSS.
 */
export async function rasterizeElementToPosterBlob(
  el: HTMLElement,
  opts?: RasterSizeOpts & {
    quality?: number;
    punchVideos?: boolean;
    mime?: 'image/jpeg' | 'image/png';
    /** No white fill; PNG with alpha. Used for layer bands stacked over video. */
    transparent?: boolean;
  }
): Promise<Blob> {
  const quality = opts?.quality ?? JPEG_QUALITY;
  const transparent = opts?.transparent === true;
  const mime = transparent ? 'image/png' : (opts?.mime ?? 'image/jpeg');
  const punchVideos = opts?.punchVideos !== false;
  const { w, h } = measureEl(el);
  const { cw, ch, sx, sy } = rasterOutputSize(w, h, opts);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const clone = el.cloneNode(true) as HTMLElement;
  inlineSafeComputedStyles(el, clone);
  clone.style.overflow = 'hidden';
  if (punchVideos) punchVideoHolesFromLive(el, clone);
  await inlineHtmlSnippets(el, clone);
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
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;transform:scale(${sx},${sy});transform-origin:0 0;background:${transparent ? 'transparent' : '#ffffff'};font-family:system-ui,-apple-system,sans-serif;color:#111111;">
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
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('rasterize_toBlob_failed'))),
        mime,
        mime === 'image/png' ? undefined : quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('rasterize_canvas_tainted'));
    }
  });
}

/** A CSS gradient drawn alone through SVG; it loads nothing external, so it cannot taint. */
async function cssBackgroundImage(value: string, w: number, h: number): Promise<HTMLImageElement> {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background-image:${escaped}"></div></foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('rasterize_gradient_failed'));
      i.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fallback when foreignObject taints: background + blob images + text via fillText.
 */
export async function rasterizeElementSafeStill(
  el: HTMLElement,
  opts?: RasterSizeOpts & { quality?: number; transparent?: boolean }
): Promise<Blob> {
  const quality = opts?.quality ?? JPEG_QUALITY;
  const transparent = opts?.transparent === true;
  const { w, h } = measureEl(el);
  const { cw, ch, sx: layoutSx, sy: layoutSy } = rasterOutputSize(w, h, opts);
  const scale = Math.min(layoutSx, layoutSy);
  const zoom = visualScale(el);
  const sx = layoutSx / zoom;
  const sy = layoutSy / zoom;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const rootStyle = getComputedStyle(el);
  const fill = rootStyle.backgroundColor;
  const hasFill = Boolean(fill) && fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent';
  if (hasFill || !transparent) {
    ctx.fillStyle = hasFill ? fill : '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
  }
  const gradient = safeBackgroundImage(rootStyle.backgroundImage);
  if (gradient && !/url\s*\(/i.test(gradient)) {
    try {
      ctx.drawImage(await cssBackgroundImage(gradient, cw, ch), 0, 0, cw, ch);
    } catch {
      /* keep the solid fill */
    }
  }

  const rootRect = el.getBoundingClientRect();

  const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of imgs) {
    const src = img.currentSrc || img.src || '';
    if (!isSafeMediaUrl(src)) continue;
    if (getComputedStyle(img).visibility === 'hidden') continue;
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    try {
      const bmp = await createImageBitmap(img);
      ctx.drawImage(
        bmp,
        (r.left - rootRect.left) * sx,
        (r.top - rootRect.top) * sy,
        r.width * sx,
        r.height * sy
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
              (r.left - rootRect.left) * sx,
              (r.top - rootRect.top) * sy,
              Math.max(4, r.width * sx)
            );
          } else {
            const words = text.trim().split(' ');
            let wi = 0;
            for (const r of rects) {
              if (wi >= words.length) break;
              let line = '';
              while (wi < words.length) {
                const trial = line ? `${line} ${words[wi]}` : words[wi]!;
                if (ctx.measureText(trial).width > r.width * sx && line) break;
                line = trial;
                wi += 1;
              }
              if (line) {
                ctx.fillText(
                  line,
                  (r.left - rootRect.left) * sx,
                  (r.top - rootRect.top) * sy,
                  Math.max(4, r.width * sx)
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
        transparent ? 'image/png' : 'image/jpeg',
        transparent ? undefined : quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('rasterize_canvas_tainted'));
    }
  });
}
