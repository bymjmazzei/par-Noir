import type { CSSProperties, ReactNode, Ref } from 'react';
import {
  pageSheetDims,
  printPageCount,
  type PenPageLayout
} from '@par-noir/pen-protocol';

/**
 * Shared sheet chrome: Flow = continuous white column; Letter/A4 = stacked
 * fixed-size page bands with hairline breaks. Content flows continuously;
 * pageLayout does not rescale layer geometry (layers use content-box px).
 */
export function PageSheetColumn({
  pageLayout,
  flowWorkspaceWidthPx,
  contentOuterHeightPx,
  className,
  style,
  children,
  sheetRef,
  onClick
}: {
  pageLayout: PenPageLayout | undefined;
  flowWorkspaceWidthPx?: number | null;
  /** Measured outer content height (including padding); drives page count. */
  contentOuterHeightPx: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  sheetRef?: Ref<HTMLDivElement>;
  onClick?: () => void;
}) {
  const dims = pageSheetDims(pageLayout, flowWorkspaceWidthPx);
  const pageH = dims.pageHeightPx;
  const pages =
    dims.paged && pageH
      ? printPageCount(Math.max(contentOuterHeightPx, pageH), pageH)
      : 1;
  const stackHeight =
    dims.paged && pageH ? pages * pageH : Math.max(contentOuterHeightPx, 320);

  return (
    <div
      ref={sheetRef}
      className={`relative bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] ${
        className || ''
      }`}
      style={{
        width: dims.pageWidthPx,
        maxWidth: '100%',
        minHeight: stackHeight,
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
