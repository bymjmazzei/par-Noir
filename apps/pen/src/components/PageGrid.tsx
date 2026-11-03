/** Editor-only positioning grid. Keep it outside the compose export root so it never publishes. */

export const PAGE_GRID_PX = 24;

const LINE = 'rgba(14, 165, 233, 0.18)';

export function PageGrid() {
  return (
    <div
      data-pen-page-grid
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        backgroundImage: `linear-gradient(to right, ${LINE} 1px, transparent 1px), linear-gradient(to bottom, ${LINE} 1px, transparent 1px)`,
        backgroundSize: `${PAGE_GRID_PX}px ${PAGE_GRID_PX}px`,
        backgroundPosition: '0 0'
      }}
    />
  );
}
