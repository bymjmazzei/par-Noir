/**
 * Viewport snap shell aligned to notebook paper (rail on first blue line, body under it).
 * Active slide via IntersectionObserver — avoids scrollTop/clientHeight desync when content overflows.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slideElsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
    slideElsRef.current = slideElsRef.current.slice(0, count);
  }, [count]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || count === 0) return;

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
          setActiveIndex(Math.max(0, Math.min(count - 1, bestIdx)));
        }
      },
      { root, threshold: [0.35, 0.5, 0.6, 0.75, 1] }
    );

    for (let i = 0; i < count; i++) {
      const el = slideElsRef.current[i];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [count, slideKeys]);

  const setSlideRef = useCallback((index: number, el: HTMLDivElement | null) => {
    slideElsRef.current[index] = el;
  }, []);

  const windowStart = Math.max(0, activeIndex - 1);
  const windowEnd = Math.min(count, activeIndex + 3);

  return (
    <div className="pen-doc-feed">
      <div className="pen-doc-feed-rail">{rail}</div>
      <div className="pen-doc-feed-viewport">
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
              const inWindow = i >= windowStart && i < windowEnd;
              const key = slideKeys?.[i] ?? String(i);
              return (
                <div
                  key={key}
                  ref={(el) => setSlideRef(i, el)}
                  className="pen-doc-feed-slide"
                  data-snap-index={i}
                  data-active={i === activeIndex ? 'true' : undefined}
                >
                  {inWindow ? renderSlide(i, i === activeIndex) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
