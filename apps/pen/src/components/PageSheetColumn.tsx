import type { CSSProperties, ReactNode, Ref } from 'react';
import {
  pageSheetDims,
  printPageCount,
  type PenPageLayout
} from '@par-noir/pen-protocol';

/**
 * Shared sheet chrome: Flow = continuous white panel (open fill or fixed W×H);
 * Letter/A4 = stacked fixed-size page bands with hairline breaks.
 */
export function PageSheetColumn({
  pageLayout,
  flowWorkspaceWidthPx,
  flowWorkspaceHeightPx,
  contentOuterHeightPx,
  className,
  style,
  children,
  sheetRef,
  onClick
}: {
  pageLayout: PenPageLayout | undefined;
  flowWorkspaceWidthPx?: number | null;
  flowWorkspaceHeightPx?: number | null;
  /** Measured outer content height (including padding); drives page count. */
  contentOuterHeightPx: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  sheetRef?: Ref<HTMLDivElement>;
  onClick?: () => void;
}) {
  const dims = pageSheetDims(pageLayout, {
    widthPx: flowWorkspaceWidthPx,
    heightPx: flowWorkspaceHeightPx
  });
  const pageH = dims.paged ? dims.pageHeightPx : null;
  const pages =
    dims.paged && pageH
      ? printPageCount(Math.max(contentOuterHeightPx, pageH), pageH)
      : 1;
  const flowMinH = !dims.paged
    ? Math.max(
        contentOuterHeightPx,
        dims.pageHeightPx || 0,
        dims.fillWidth ? 0 : 320
      )
    : 0;
  const stackHeight =
    dims.paged && pageH ? pages * pageH : Math.max(flowMinH, 240);

  return (
    <div
      ref={sheetRef}
      data-pen-compose-export-root
      className={`relative bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] ${
        dims.fillWidth ? 'w-full' : ''
      } ${className || ''}`}
      style={{
        width: dims.fillWidth ? '100%' : dims.pageWidthPx ?? undefined,
        maxWidth: '100%',
        minHeight: dims.fillWidth ? `max(100%, ${stackHeight}px)` : stackHeight,
        height: dims.fillWidth && !dims.pageHeightPx ? '100%' : undefined,
        ...style
      }}
      onClick={onClick}
    >
      {dims.paged && pageH
        ? Array.from({ length: pages }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 border-x border-neutral-200/60 bg-white"
              style={{
                top: i * pageH,
                height: pageH,
                zIndex: 0,
                boxShadow:
                  i === 0
                    ? undefined
                    : 'inset 0 8px 8px -8px rgba(0,0,0,0.12), 0 -1px 0 rgba(0,0,0,0.08)'
              }}
            />
          ))
        : null}
      <div className="relative z-[1]" style={{ minHeight: stackHeight }}>
        {children}
      </div>
      {dims.paged && pageH
        ? Array.from({ length: pages - 1 }, (_, i) => (
            <div
              key={`break-${i}`}
              aria-hidden
              title="Page break"
              className="pointer-events-none absolute left-0 right-0 z-[2] flex items-center"
              style={{ top: (i + 1) * pageH - 6, height: 12 }}
            >
              <div className="h-px flex-1 bg-neutral-300" />
              <span className="shrink-0 px-2 text-[9px] font-medium uppercase tracking-wider text-neutral-400">
                Page {i + 2}
              </span>
              <div className="h-px flex-1 bg-neutral-300" />
            </div>
          ))
        : null}
    </div>
  );
}
