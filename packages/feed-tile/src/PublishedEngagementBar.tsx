import type { CSSProperties, ReactNode } from 'react';

/**
 * Static chrome of the published social post rail (browse FeedEngagementSidebar).
 * Preview-only. Callers keep it outside compose/export roots so publish never paints it.
 */

const ICON = 'h-6 w-6 text-white md:h-7 md:w-7';
const COUNT =
  'absolute -bottom-1 -left-1 min-w-[1rem] text-center text-xs font-medium text-white';
const SHADOW = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))';

function IconSvg({
  className,
  style,
  children
}: {
  className: string;
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
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Right-edge rail a published social post paints over the frame. Display only. */
export function PublishedEngagementBar() {
  return (
    <div
      data-pen-engagement-guide=""
      aria-hidden
      className="pointer-events-none absolute right-2 z-20 flex flex-col items-center md:right-4"
      style={{
        gap: '16px',
        bottom: 'calc(32px + env(safe-area-inset-bottom, 0px) + 8px)'
      }}
    >
      <div
        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-black/15 md:h-14 md:w-14"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))' }}
      >
        <IconSvg className={`${ICON} fill-white`}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </IconSvg>
      </div>

      <div className="relative">
        <IconSvg className={`${ICON} transition-colors`} style={{ fill: 'white', filter: SHADOW }}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </IconSvg>
        <span className={COUNT} style={{ filter: SHADOW }}>
          0
        </span>
      </div>

      <div className="relative">
        <IconSvg
          className={`${ICON} transition-colors`}
          style={{ fill: 'white', transform: 'scaleX(-1)', filter: SHADOW }}
        >
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
        </IconSvg>
        <span className={COUNT} style={{ filter: SHADOW }}>
          0
        </span>
      </div>

      <div className="relative">
        <IconSvg className={`${ICON} transition-colors`} style={{ fill: 'white', filter: SHADOW }}>
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </IconSvg>
        <span className={COUNT} style={{ filter: SHADOW }}>
          0
        </span>
      </div>

      <div className="relative">
        <svg
          className={ICON}
          viewBox="0 0 223.87 199.31"
          fill="none"
          style={{ filter: SHADOW }}
          aria-hidden
        >
          <path
            d="M0,90.56c2.45-9.18,8.97-10.47,16.68-13.68C82.51,49.42,150.89,27.58,216.79.2c3.35-.69,7.2.32,7.08,4.26l-69.12,188.52c-4.53,6.91-14.09,7.87-21.04,4.25-20.64-14.84-41-30.05-61.77-44.72-.7-.5-1.69.21-1.23-1.72L207.08,15.94,52.13,137.23,4.07,102.91l-4.07-7.38v-4.98Z"
            fill="white"
          />
        </svg>
        <span className={COUNT} style={{ filter: SHADOW }}>
          0
        </span>
      </div>

      <div className="flex flex-col items-center justify-center" style={{ width: '1.75rem' }}>
        <span
          className="text-center text-sm font-medium leading-tight text-white md:text-base"
          style={{ filter: SHADOW }}
        >
          0
        </span>
        <span
          className="whitespace-nowrap text-center font-medium leading-tight text-white"
          style={{
            filter: SHADOW,
            fontSize: 'clamp(0.5rem, 1.5vw, 0.625rem)',
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
