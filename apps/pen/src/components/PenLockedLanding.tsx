/**
 * Locked Pen — title card, then ruled notebook sheet with in-line copy.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';
import { handoffHasSigningKeys } from '../services/penKeys';

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
 * Reference vmin ≈ 430px → scale 1. Also shrink so heading + 9 rule
 * slots + footer fit the page body. Fit math must use body height (and
 * heading/footer measured at the current scale), never paper height —
 * paper is flex:1 and shrinks when scale grows, which would feedback.
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    const body = bodyRef.current;
    const heading = headingRef.current;
    const footer = footerRef.current;
    if (!page || !body || !heading || !footer) return;

    let raf = 0;
    const cssScale = Number.parseFloat(
      getComputedStyle(page).getPropertyValue('--pen-locked-scale').trim()
    );
    let lastScale = Number.isFinite(cssScale) && cssScale > 0 ? cssScale : 1;

    const apply = () => {
      raf = 0;
      const vmin = Math.min(window.innerWidth, window.innerHeight);
      let scale = vmin / LOCKED_REF_VMIN_PX;

      const bodyH = body.clientHeight;
      const cur = lastScale > 0 ? lastScale : 1;
      const headingBase = heading.clientHeight / cur;
      const footerBase = footer.clientHeight / cur;
      const neededAt1 =
        headingBase + footerBase + LOCKED_BASE_PITCH_PX * LOCKED_PAPER_SLOTS;
      if (bodyH > 0 && neededAt1 > 0) {
        scale = Math.min(scale, bodyH / neededAt1);
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

    // Observe only the page body — its height is viewport/chrome-driven
    // and does not change when --pen-locked-scale updates.
    const ro = new ResizeObserver(schedule);
    ro.observe(body);
    window.addEventListener('resize', schedule);
    const logo = logoRef.current;
    if (logo && !logo.complete) {
      logo.addEventListener('load', schedule);
    }
    void document.fonts?.ready?.then(schedule);
    schedule();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      logo?.removeEventListener('load', schedule);
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
            requireMessagingHandoff
            isMessagingReady={(pending) => handoffHasSigningKeys(pending?.messagingHandoff)}
            config={unlockConfig}
            onBeforeNavigate={onBeforeNavigate}
            onPopupResult={onPopupResult}
            onPopupFlowFailed={onPopupFlowFailed}
          />
      </header>

      <div ref={bodyRef} className="pen-locked-page-body">
        <div className="pen-library-page pen-locked-library bg-white">
          <div className="pen-library-notebook flex-1">
            <div className="pen-library-notebook-inner">
              <div className="pen-locked-main">
                <div className="pen-explorer-rail" aria-hidden />

                {/* Title card — no notebook rules */}
                <div ref={headingRef} className="pen-locked-heading">
                  <h1 className="pen-locked-title">Pen</h1>
                  <p className="pen-locked-subtitle">
                    Encrypted collaboration published through your cloud
                  </p>
                </div>

                {/* Ruled sheet — blue + red stop where the footer begins */}
                <div className="pen-locked-paper">
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
                          requireMessagingHandoff
                          isMessagingReady={(pending) => handoffHasSigningKeys(pending?.messagingHandoff)}
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
                ref={footerRef}
                className="pen-locked-footer"
                style={{ backgroundImage: `url(${FOOTER_BG_SRC})` }}
              >
                <img
                  ref={logoRef}
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
