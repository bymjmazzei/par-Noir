import React, { useEffect, useMemo, useRef } from 'react';

type Drip = {
  x: number; // normalized 0..1
  width: number;
  maxLen: number;
  wobbleSeed: number;
  id: 'leftThin' | 'midLeft' | 'center' | 'midRight' | 'rightThick';
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Deterministic RNG (mulberry32)
function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(h)) return null;
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixTowardWhite(hex: string, t: number, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${alpha})`;
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(rgb.r + (255 - rgb.r) * tt);
  const g = Math.round(rgb.g + (255 - rgb.g) * tt);
  const b = Math.round(rgb.b + (255 - rgb.b) * tt);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface SprayDripOverlayCanvasProps {
  color: string;
  seed?: number;
}

/**
 * Full-page fixed overlay that paints a spray edge at the bottom of the hero
 * and lets drips extend further down as the user scrolls.
 */
export function SprayDripOverlayCanvas({ color, seed = 7 }: SprayDripOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string>('');

  const drips = useMemo<Drip[]>(() => {
    // Exactly 5 drips with fixed positions and relative widths.
    // - left: thin
    // - right: thick
    // - 3 in between
    //
    // NOTE: x is normalized 0..1 to scale with viewport.
    // width is in CSS pixels and is used to shape the silhouette.
    const wobbleBase = seed * 997;
    return [
      { id: 'leftThin', x: 0.12, width: 10, maxLen: 0, wobbleSeed: wobbleBase + 1 },
      { id: 'midLeft', x: 0.32, width: 14, maxLen: 0, wobbleSeed: wobbleBase + 2 },
      { id: 'center', x: 0.52, width: 18, maxLen: 0, wobbleSeed: wobbleBase + 3 },
      { id: 'midRight', x: 0.68, width: 14, maxLen: 0, wobbleSeed: wobbleBase + 4 },
      { id: 'rightThick', x: 0.88, width: 34, maxLen: 0, wobbleSeed: wobbleBase + 5 },
    ];
  }, [seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function getDocY(el: Element) {
      const r = el.getBoundingClientRect();
      return r.top + window.scrollY;
    }

    function punchOutForText(w: number, h: number) {
      const selectors = [
        // Header
        '.home-header .home-logo',
        '.home-header .home-nav a',
        // Hero
        '.home-hero .home-headline',
        '.home-hero .home-lead',
        // Offerings intro
        '.home-offerings-intro .home-section-title',
        '.home-offerings-intro .home-section-lead',
        // Offerings tiles
        '.home-offering-column .home-offering-price',
        '.home-offering-column .home-offering-note',
        '.home-offering-column .home-offering-desc',
        // Demo thumbnails inside tiles
        '.home-offering-demo-title',
        '.home-offering-demo-cta',
        // Footer
        '.home-footer h4',
        '.home-footer a',
        '.home-footer .home-footer-bottom',
      ];

      const els = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)));
      if (!els.length) return;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Slightly larger padding on big hero text.
      for (const el of els) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (!isFinite(r.left) || !isFinite(r.top)) continue;
        if (r.width <= 0 || r.height <= 0) continue;

        // Skip if far outside viewport (avoid unnecessary work).
        if (r.bottom < -200 || r.top > h + 200) continue;

        const isHeroHeadline = (el as HTMLElement).classList.contains('home-headline');
        const padX = isHeroHeadline ? 14 : 8;
        const padY = isHeroHeadline ? 10 : 6;
        const x = Math.max(0, r.left - padX);
        const y = Math.max(0, r.top - padY);
        const ww = Math.min(w, r.width + padX * 2);
        const hh = Math.min(h, r.height + padY * 2);
        const radius = Math.min(14, Math.max(6, Math.min(ww, hh) * 0.25));

        roundedRectPath(ctx, x, y, ww, hh, radius);
        ctx.fill();
      }

      ctx.restore();
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const hero = document.querySelector('.home-hero');
      const footer = document.querySelector('.home-footer');
      const offeringsIntro = document.querySelector('.home-offerings-intro');
      const firstOfferingTile = document.querySelector('.home-offerings-grid .home-offering-column');
      const linkBioNote = Array.from(document.querySelectorAll('.home-offering-note')).find((el) =>
        (el.textContent || '').includes('Link in bio — no monthly fees, only yearly domain fees.')
      );
      if (!hero || !footer) return;

      const heroBottomDoc = getDocY(hero) + (hero as HTMLElement).offsetHeight;
      const footerTopDoc = getDocY(footer);
      const offeringsIntroDoc = offeringsIntro ? getDocY(offeringsIntro) : heroBottomDoc + 600;
      const firstTileDoc = firstOfferingTile ? getDocY(firstOfferingTile) : offeringsIntroDoc + 120;
      const noteDoc = linkBioNote ? getDocY(linkBioNote) : firstTileDoc + 140;

      const scrollY = window.scrollY;
      const y0View = heroBottomDoc - scrollY; // where the spray edge sits in the viewport

      // Global progress: 0 at top, 1 near footer. Start with some drip on load.
      const docSpan = Math.max(800, footerTopDoc - heroBottomDoc);
      const raw = clamp01((scrollY + window.innerHeight * 0.35 - heroBottomDoc) / docSpan);
      const baseProgress = 0.22; // drips visible on load
      const progress = clamp01(baseProgress + raw * (1 - baseProgress));

      // Draw spray edge only when near viewport to avoid weird floating edge.
      const drawSheet = y0View > -220 && y0View < h + 220;

      if (drawSheet) {
        const edgeY = y0View + 1; // bottom of hero in viewport
        const baseLen = 110;

        // Per-drip max lengths based on DOM anchors (doc space).
        const maxRight = footerTopDoc - heroBottomDoc + 520; // into footer pool
        const maxLeft = (footerTopDoc - heroBottomDoc) * 0.75; // ~3/4 down page
        const maxCenter = Math.max(0, Math.min(noteDoc - heroBottomDoc - 10, footerTopDoc - heroBottomDoc));
        const maxBeforeIntro = Math.max(0, offeringsIntroDoc - heroBottomDoc - 18);
        const maxSmall = Math.max(0, Math.min(150, maxBeforeIntro)); // “move only a bit”

        // Scroll stops.
        const centerTravel = Math.max(220, firstTileDoc - heroBottomDoc);
        const centerRaw = clamp01((scrollY + window.innerHeight * 0.35 - heroBottomDoc) / centerTravel);
        const centerProgress = clamp01(baseProgress + centerRaw * (1 - baseProgress));

        const smallTravel = Math.max(160, maxBeforeIntro * 0.35);
        const smallRaw = clamp01((scrollY + window.innerHeight * 0.2 - heroBottomDoc) / smallTravel);
        const smallProgress = clamp01(baseProgress + smallRaw * (1 - baseProgress));

        function falloff(dx: number, sigma: number) {
          const s = Math.max(8, sigma);
          const v = Math.exp(-(dx * dx) / (2 * s * s));
          return Math.pow(v, 1.55); // sharpen
        }

        // Build a single continuous paint "sheet" like the reference image.
        const sampleCount = 140;
        const xs: number[] = [];
        const ys: number[] = [];
        const rand = mulberry32(Math.floor(seed * 10_000));

        for (let i = 0; i <= sampleCount; i++) {
          const x = (i / sampleCount) * w;
          const xn = x / w;

          // Base sheet thickness + rounded scallops.
          const base = 78;
          const scallop =
            16 * Math.sin(xn * Math.PI * 2 * 1.1 + seed * 0.7) +
            9 * Math.sin(xn * Math.PI * 2 * 2.9 + seed * 1.3);
          const micro =
            4.5 * Math.sin(xn * Math.PI * 2 * 8.5 + seed * 2.1) +
            2.5 * Math.sin(xn * Math.PI * 2 * 15.0 + seed * 0.9);

          let y = edgeY + base + scallop + micro;

          // Each drip contributes a rounded “neck” bulge + a stream length.
          for (const d of drips) {
            const srcX = d.x * w;
            const dx = x - srcX;
            const sigmaNeck = 14 + d.width * 1.15;
            const sigmaStream = 18 + d.width * 1.35;

            // Always present: neck bulge so it looks wet on load.
            const neckAmp = 18 + d.width * 0.55;
            y += neckAmp * falloff(dx, sigmaNeck);

            let maxLen = 0;
            let p = progress;
            if (d.id === 'rightThick') {
              maxLen = maxRight;
              p = progress;
            } else if (d.id === 'leftThin') {
              maxLen = maxLeft;
              p = progress;
            } else if (d.id === 'center') {
              maxLen = maxCenter;
              p = centerProgress; // stop growing when user reaches first offering tile
            } else {
              maxLen = maxSmall; // the other two move only a bit, stop before offerings title
              p = smallProgress;
            }

            const len = baseLen + p * maxLen;
            y += len * falloff(dx, sigmaStream);
          }

          // Prevent weird inversions when edge is near top.
          y = Math.max(edgeY + 24, y);

          xs.push(x);
          ys.push(y);
        }

        // Fill: from slightly inside the hero down to the bottom edge.
        ctx.save();
        ctx.globalAlpha = 0.94;
        ctx.fillStyle = color;
        ctx.shadowColor = 'rgba(0,0,0,0.10)';
        ctx.shadowBlur = 10;

        const topOverlap = 180;
        ctx.beginPath();
        ctx.moveTo(0, edgeY - topOverlap);
        ctx.lineTo(w, edgeY - topOverlap);
        ctx.lineTo(w, ys[ys.length - 1]);
        for (let i = xs.length - 2; i >= 0; i--) {
          ctx.lineTo(xs[i], ys[i]);
        }
        ctx.closePath();
        ctx.fill();

        // Wet highlight INSIDE the paint (no white band gap).
        ctx.clip();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = mixTowardWhite(color, 0.55, 0.32);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0] - 14);
        for (let i = 1; i < xs.length; i++) {
          ctx.lineTo(xs[i], ys[i] - 14);
        }
        ctx.stroke();

        // Vertical glints on the long drips.
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = mixTowardWhite(color, 0.72, 0.18);
        ctx.lineWidth = 2;
        for (const d of drips) {
          if (d.id === 'midLeft' || d.id === 'midRight') continue;
          const x = d.x * w + (rand() - 0.5) * 10;
          let p = progress;
          let maxLen = maxRight;
          if (d.id === 'rightThick') {
            p = progress;
            maxLen = maxRight;
          } else if (d.id === 'leftThin') {
            p = progress;
            maxLen = maxLeft;
          } else if (d.id === 'center') {
            p = centerProgress;
            maxLen = maxCenter;
          }
          const len = baseLen + p * maxLen;
          const y1 = edgeY + 34;
          const y2 = edgeY + Math.min(len - 40, h + 220);
          if (y2 <= y1 + 18) continue;
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // Footer pool hint: when footer enters view, add a glossy pool highlight near bottom.
      const footerTopView = footerTopDoc - scrollY;
      if (footerTopView < h) {
        const poolY = Math.max(footerTopView, 0);
        const poolH = Math.min(180, h - poolY);
        ctx.globalAlpha = 0.14;
        const g = ctx.createLinearGradient(0, poolY, 0, poolY + poolH);
        g.addColorStop(0, mixTowardWhite(color, 0.85, 0.0));
        g.addColorStop(1, mixTowardWhite(color, 0.85, 0.22));
        ctx.fillStyle = g;
        ctx.fillRect(0, poolY, w, poolH);
      }

      // Paint overlays objects; remove paint behind text so readability stays perfect.
      punchOutForText(w, h);

      ctx.globalAlpha = 1;

      // Throttle key (scroll/size)
      lastKeyRef.current = `${scrollY}|${w}|${h}`;
    }

    function tick() {
      rafRef.current = requestAnimationFrame(tick);
      const key = `${window.scrollY}|${window.innerWidth}|${window.innerHeight}`;
      if (key === lastKeyRef.current) return;
      draw();
    }

    resize();
    draw();
    tick();

    const onResize = () => {
      resize();
      lastKeyRef.current = '';
      draw();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [color, drips, seed]);

  return <canvas ref={canvasRef} className="spray-drip-overlay" />;
}

