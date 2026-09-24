/**
 * Viewport snap shell aligned to notebook paper (rail on first blue line, body under it).
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
  renderSlide,
  empty,
  loading
}: {
  rail: ReactNode;
  count: number;
  renderSlide: (index: number, active: boolean) => ReactNode;
  empty?: ReactNode;
  loading?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || count === 0) return;
    const h = el.clientHeight || 1;
    const idx = Math.round(el.scrollTop / h);
    setActiveIndex(Math.max(0, Math.min(count - 1, idx)));
  }, [count]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [count]);

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
              return (
                <div
                  key={i}
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
