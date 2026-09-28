/** Editor-only guide lines. They are not part of a published page. */

import type { PointerEvent as ReactPointerEvent } from 'react';

export function PageGuides({
  guides,
  onMove
}: {
  guides: Array<{ id: string; axis: 'vertical' | 'horizontal'; position: number }>;
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
      const limit = axis === 'vertical' ? rect.width : rect.height;
      onMove(id, Math.max(0, Math.min(limit, raw)));
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
              ? { left: guide.position - 4, top: 0, width: 8, height: '100%', cursor: 'ew-resize' }
              : { top: guide.position - 4, left: 0, height: 8, width: '100%', cursor: 'ns-resize' }
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
