/** Editor-only guide lines. They are not part of a published page. */

import type { PointerEvent as ReactPointerEvent } from 'react';

export type GuideSpan = { left: number; right: number; top: number; bottom: number };

const NO_SPAN: GuideSpan = { left: 0, right: 0, top: 0, bottom: 0 };

export function PageGuides({
  guides,
  span = NO_SPAN,
  onMove
}: {
  guides: Array<{ id: string; axis: 'vertical' | 'horizontal'; position: number }>;
  /** Extra pixels the line runs past the page, into the workspace. */
  span?: GuideSpan;
  onMove: (id: string, position: number) => void;
}) {
  function drag(event: ReactPointerEvent, id: string, axis: 'vertical' | 'horizontal') {
    event.stopPropagation();
    const surface = (event.currentTarget as HTMLElement).parentElement;
    if (!surface) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      const raw = axis === 'vertical' ? next.clientX - rect.left : next.clientY - rect.top;
      const min = axis === 'vertical' ? -span.left : -span.top;
      const max = axis === 'vertical' ? rect.width + span.right : rect.height + span.bottom;
      onMove(id, Math.max(min, Math.min(max, raw)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {guides.map((guide) => (
        <button
          key={guide.id}
          type="button"
          aria-label={guide.axis === 'vertical' ? 'Vertical guide' : 'Horizontal guide'}
          className="pointer-events-auto absolute"
          style={
            guide.axis === 'vertical'
              ? {
                  left: guide.position - 4,
                  top: -span.top,
                  width: 8,
                  height: `calc(100% + ${span.top + span.bottom}px)`,
                  cursor: 'ew-resize'
                }
              : {
                  top: guide.position - 4,
                  left: -span.left,
                  height: 8,
                  width: `calc(100% + ${span.left + span.right}px)`,
                  cursor: 'ns-resize'
                }
          }
          onPointerDown={(event) => drag(event, guide.id, guide.axis)}
        >
          <span
            className="pointer-events-none absolute bg-sky-500"
            style={
              guide.axis === 'vertical'
                ? { left: 3, top: 0, width: 1, height: '100%' }
                : { top: 3, left: 0, height: 1, width: '100%' }
            }
          />
        </button>
      ))}
    </div>
  );
}
