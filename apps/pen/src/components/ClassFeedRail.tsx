/**
 * Horizontal class feed selector (browse FeedRail UX, Pen-local).
 */

import { useCallback, useEffect, useRef } from 'react';

export interface ClassFeedRailItem {
  id: string;
  label: string;
}

export function ClassFeedRail({
  items,
  activeId,
  onSelect
}: {
  items: ClassFeedRailItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);

  const calculateScrollToCenter = useCallback((element: HTMLElement): number => {
    if (!scrollContainerRef.current) return 0;
    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const screenCenter = window.innerWidth / 2;
    const elementCenter = elementRect.left - containerRect.left + elementRect.width / 2;
    return container.scrollLeft + (elementCenter - screenCenter);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const inner = innerContainerRef.current;
    if (!container || !inner) return;
    const active = inner.querySelector(`[data-feed-id="${activeId}"]`) as HTMLElement | null;
    if (!active) return;
    container.scrollTo({ left: Math.max(0, calculateScrollToCenter(active)), behavior: 'smooth' });
  }, [activeId, items, calculateScrollToCenter]);

  return (
    <div className="pen-class-feed-rail" role="tablist" aria-label="Content class feeds">
      <div ref={scrollContainerRef} className="pen-class-feed-rail-scroll">
        <div ref={innerContainerRef} className="pen-class-feed-rail-inner">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-feed-id={item.id}
                aria-selected={active}
                className={`pen-class-feed-rail-tab${active ? ' is-active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
