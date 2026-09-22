/**
 * Locked Pen — title card, then ruled notebook sheet with in-line copy.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

const CHECKLIST = [
  'Author anything',
  'encrypted collaboration',
  'customize your feed posts',
  'publish to your networks'
] as const;

const LOGO_SRC = './branding/Par-Noir-Logo-White.png';
const FOOTER_BG_SRC = './branding/Par-Noir-Background-Dark.png';

/**
 * One scale drives the whole locked sheet (rail, gutters, type, logo) —
 * not just the copy to the right of the red lines.
 *
 * Reference vmin ≈ 430px → scale 1. Also shrink if 9 rule slots would
 * overrun the paper (keep ~2 empty lines above the footer).
 */
const LOCKED_PAPER_SLOTS = 9;
const LOCKED_REF_VMIN_PX = 430;
const LOCKED_BASE_PITCH_PX = 28;
const LOCKED_SCALE_MIN = 0.62;
const LOCKED_SCALE_MAX = 1.35;

/** Rectangular hand-ink outline for the unlock CTA. */
function HandDrawnOutline() {
  return (
    <svg
      className="pen-locked-cta-outline"
      viewBox="0 0 140 44"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M6.5 5.5h126.5c1.4.2 2.6 1.1 3.1 2.4.4 1.1.2 2.4-.6 3.3v24.2c.2 1.6-.6 3.1-2 3.8-1 .5-2.2.6-3.3.5H8.2c-1.8-.1-3.4-1.2-4-2.9-.3-1-.2-2.1.2-3V10.1C4 7.8 5.1 6 6.5 5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M8 6.2h121.5M7.2 37.4h122.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.95"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

export function PenLockedLanding({
  busy,
  error,
  onBeforeNavigate,
  onPopupResult,
  onPopupFlowFailed,
  addMenu
}: {
  busy: boolean;
  error: string | null;
  onBeforeNavigate: (state: string) => void;
  onPopupResult: (r: PnOAuthPopupResult) => void;
  onPopupFlowFailed: (reason: string) => void;
  addMenu: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    const paper = paperRef.current;
    if (!page || !paper) return;

    let raf = 0;
    let lastScale = 0;

    const apply = () => {
      raf = 0;
      const vmin = Math.min(window.innerWidth, window.innerHeight);
      let scale = vmin / LOCKED_REF_VMIN_PX;

      const paperH = paper.clientHeight;
      if (paperH > 0) {
        const maxScaleForPaper =
          paperH / (LOCKED_BASE_PITCH_PX * LOCKED_PAPER_SLOTS);
        scale = Math.min(scale, maxScaleForPaper);
      }

      scale = Math.min(LOCKED_SCALE_MAX, Math.max(LOCKED_SCALE_MIN, scale));
      if (Math.abs(scale - lastScale) < 0.004) return;
      lastScale = scale;
      page.style.setProperty('--pen-locked-scale', scale.toFixed(4));
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(paper);
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const unlockConfig = {
    clientId: PN_CLIENT_ID,
    redirectUri: `${window.location.origin}/oauth-callback.html`,
    apiEndpoint: API_ENDPOINT,
    scope: ['openid', 'profile', 'cloud:read', 'cloud:app']
  };

  return (
    <div ref={pageRef} className="pen-locked-page bg-white text-black">
      <header className="pen-app-chrome fixed inset-x-0 top-0 z-50">
        <div className="pen-app-chrome-left">
          <span className="pen-app-chrome-action" aria-hidden />
          {addMenu}
          <span className="pen-app-chrome-brand">Pen</span>
        </div>
        <UnlockButton
          className="pen-app-chrome-lock"
          iconOnly
          title="Unlock"
          config={unlockConfig}
          onBeforeNavigate={onBeforeNavigate}
          onPopupResult={onPopupResult}
          onPopupFlowFailed={onPopupFlowFailed}
        />
      </header>

      <div className="pen-locked-page-body">
        <div className="pen-library-page pen-locked-library bg-white">
          <div className="pen-library-notebook flex-1">
            <div className="pen-library-notebook-inner">
              <div className="pen-locked-main">
                <div className="pen-explorer-rail" aria-hidden />

                {/* Title card — no notebook rules */}
                <div className="pen-locked-heading">
                  <h1 className="pen-locked-title">Pen</h1>
                  <p className="pen-locked-subtitle">
                    Encrypted collaboration published through your cloud
                  </p>
                </div>

                {/* Ruled sheet — blue + red stop where the footer begins */}
                <div ref={paperRef} className="pen-locked-paper">
                  <div className="pen-locked-copy-group">
                    <ul className="pen-locked-checklist">
                      {CHECKLIST.map((label) => (
                        <li key={label} className="pen-locked-check-item">
                          <span className="pen-locked-copy-bullet" aria-hidden>
                            •
                          </span>
                          <span className="pen-locked-copy-text">{label}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="pen-locked-cta-row">
                      <span className="pen-locked-cta-wrap">
                        <HandDrawnOutline />
                        <UnlockButton
                          className="pen-locked-unlock-cta"
                          config={unlockConfig}
                          onBeforeNavigate={onBeforeNavigate}
                          onPopupResult={onPopupResult}
                          onPopupFlowFailed={onPopupFlowFailed}
                          showIcon={false}
                          title="Unlock pN"
                        >
                          unlock pN
                        </UnlockButton>
                      </span>
                      {busy && (
                        <span className="pen-locked-copy-status">Finishing unlock…</span>
                      )}
                      {error && <span className="pen-locked-copy-error">{error}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <footer
                className="pen-locked-footer"
                style={{ backgroundImage: `url(${FOOTER_BG_SRC})` }}
              >
                <img
                  className="pen-locked-logo"
                  src={LOGO_SRC}
                  alt="par Noir"
                  width={320}
                  height={96}
                  decoding="async"
                />
                <p className="pen-locked-footer-copy">© par Noir</p>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
