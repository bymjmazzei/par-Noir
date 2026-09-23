/**
 * Renders a label in its Google font face, loading CSS when the row is visible or hovered.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { ensureGoogleFontLoaded } from '../services/penGoogleFonts';

export function GoogleFontPreviewLabel({
  family,
  children,
  className
}: {
  family: string;
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root =
      el.closest('.pen-ribbon-menu-panel') ||
      el.closest('[data-pen-font-scroll]') ||
      null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ensureGoogleFontLoaded(family);
        }
      },
      { root: root instanceof Element ? root : null, rootMargin: '80px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [family]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontFamily: family }}
      onMouseEnter={() => ensureGoogleFontLoaded(family)}
    >
      {children ?? family}
    </span>
  );
}
