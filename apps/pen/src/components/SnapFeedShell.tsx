/**
 * Viewport snap shell aligned to notebook paper (rail on first blue line, body under it).
 * Slide height is pinned to measured scrollport px so snap distances stay fixed.
 * All slides stay mounted — active index is for data-active / media only.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

function slideKeysSignature(keys: string[] | undefined, count: number): string {
  if (keys && keys.length === count) return keys.join('\0');
  return `count:${count}`;
}

export function SnapFeedShell({
  rail,
  count,
  slideKeys,
  renderSlide,
  empty,
  loading
}: {
  rail: ReactNode;
  count: number;
  /** Stable keys per slide (e.g. templateId); falls back to index. */
  slideKeys?: string[];
  renderSlide: (index: number, active: boolean) => ReactNode;
  empty?: ReactNode;
  loading?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slideElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slidePx, setSlidePx] = useState(0);

  const keysSig = useMemo(
    () => slideKeysSignature(slideKeys, count),
    [slideKeys, count]
  );

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
    slideElsRef.current = slideElsRef.current.slice(0, count);
  }, [keysSig, count]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const h = Math.round(viewport.getBoundingClientRect().height);
      if (h > 0) setSlidePx(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || count === 0 || slidePx <= 0) return;

    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.snapIndex);
          if (!Number.isFinite(idx)) continue;
          ratios.set(idx, entry.intersectionRatio);
        }
        let bestIdx = 0;
        let bestRatio = -1;
        for (const [idx, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIdx = idx;
          }
        }
        if (bestRatio >= 0.35) {
          setActiveIndex((prev) => {
            const next = Math.max(0, Math.min(count - 1, bestIdx));
            return next === prev ? prev : next;
          });
        }
      },
      { root, threshold: [0.35, 0.5, 0.6, 0.75, 1] }
    );

    for (let i = 0; i < count; i++) {
      const el = slideElsRef.current[i];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [count, keysSig, slidePx]);

  const setSlideRef = useCallback((index: number, el: HTMLDivElement | null) => {
    slideElsRef.current[index] = el;
  }, []);

  const slideStyle =
    slidePx > 0
      ? ({
          height: `${slidePx}px`,
          minHeight: `${slidePx}px`,
          maxHeight: `${slidePx}px`,
          flex: `0 0 ${slidePx}px`
        } as const)
      : undefined;

  return (
    <div className="pen-doc-feed">
      <div className="pen-doc-feed-rail">{rail}</div>
      <div ref={viewportRef} className="pen-doc-feed-viewport">
        <div ref={scrollRef} className="pen-doc-feed-scroll" data-pen-snap-feed>
          {loading ? (
            loading
          ) : count === 0 ? (
            empty || (
              <div className="pen-doc-feed-empty">
                <p className="text-sm text-neutral-500">Nothing here.</p>
              </div>
            )
          ) : (
            Array.from({ length: count }, (_, i) => {
              const key = slideKeys?.[i] ?? String(i);
              return (
                <div
                  key={key}
                  ref={(el) => setSlideRef(i, el)}
                  className="pen-doc-feed-slide"
                  data-snap-index={i}
                  data-active={i === activeIndex ? 'true' : undefined}
                  style={slideStyle}
                >
                  {renderSlide(i, i === activeIndex)}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
