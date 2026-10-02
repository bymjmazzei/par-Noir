import { useRef, type CSSProperties, type ReactNode } from 'react';
import { engagementRailLayout, useFeedFrameHeight } from './engagementRailLayout.js';

/**
 * Static chrome of the published social post rail (browse FeedEngagementSidebar).
 * Preview-only. Callers keep it outside compose/export roots so publish never paints it.
 */

const COUNT =
  'absolute -bottom-1 -left-1 min-w-[1rem] text-center font-medium leading-none text-white';
const SHADOW = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))';

function IconSvg({
  style,
  children
}: {
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="white"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Right-edge rail a published social post paints over the frame. Display only. */
export function PublishedEngagementBar() {
  const railRef = useRef<HTMLDivElement>(null);
  const frameHeight = useFeedFrameHeight(railRef);
  const layout = engagementRailLayout(frameHeight);
  const iconStyle: CSSProperties = { width: layout.iconPx, height: layout.iconPx };
  const countStyle: CSSProperties = {
    filter: SHADOW,
    fontSize: Math.max(8, layout.iconPx * 0.45)
  };

  return (
    <div
      ref={railRef}
      data-pen-engagement-guide=""
      aria-hidden
      className="pointer-events-none absolute right-2 z-20 flex flex-col items-center"
      style={{
        gap: layout.gapPx,
        bottom: `calc(${layout.bottomPx}px + env(safe-area-inset-bottom, 0px))`
      }}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-black/15"
        style={{ ...iconStyle, filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))' }}
      >
        <IconSvg style={{ ...iconStyle, width: layout.iconPx * 0.62, height: layout.iconPx * 0.62 }}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </IconSvg>
      </div>

      <div className="relative" style={iconStyle}>
        <IconSvg style={{ ...iconStyle, fill: 'white', filter: SHADOW }}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </IconSvg>
        <span className={COUNT} style={countStyle}>
          0
        </span>
      </div>

      <div className="relative" style={iconStyle}>
        <IconSvg style={{ ...iconStyle, fill: 'white', transform: 'scaleX(-1)', filter: SHADOW }}>
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
        </IconSvg>
        <span className={COUNT} style={countStyle}>
          0
        </span>
      </div>

      <div className="relative" style={iconStyle}>
        <IconSvg style={{ ...iconStyle, fill: 'white', filter: SHADOW }}>
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </IconSvg>
        <span className={COUNT} style={countStyle}>
          0
        </span>
      </div>

      <div className="relative" style={iconStyle}>
        <svg
          className="text-white"
          viewBox="0 0 223.87 199.31"
          fill="none"
          style={{ ...iconStyle, filter: SHADOW }}
          aria-hidden
        >
          <path
            d="M0,90.56c2.45-9.18,8.97-10.47,16.68-13.68C82.51,49.42,150.89,27.58,216.79.2c3.35-.69,7.2.32,7.08,4.26l-69.12,188.52c-4.53,6.91-14.09,7.87-21.04,4.25-20.64-14.84-41-30.05-61.77-44.72-.7-.5-1.69.21-1.23-1.72L207.08,15.94,52.13,137.23,4.07,102.91l-4.07-7.38v-4.98Z"
            fill="white"
          />
        </svg>
        <span className={COUNT} style={countStyle}>
          0
        </span>
      </div>

      <div
        className="flex flex-col items-center justify-center"
        style={{ width: layout.iconPx, height: layout.iconPx }}
      >
        <span
          className="text-center font-medium leading-none text-white"
          style={{ filter: SHADOW, fontSize: Math.max(8, layout.iconPx * 0.5) }}
        >
          0
        </span>
        <span
          className="whitespace-nowrap text-center font-medium leading-none text-white"
          style={{
            filter: SHADOW,
            fontSize: Math.max(6, layout.iconPx * 0.32),
            transform: 'scaleX(0.9)',
            transformOrigin: 'center'
          }}
        >
          VIEWS
        </span>
      </div>
    </div>
  );
}
