/**
 * Locked Pen — same chrome + notebook rules as My Library; unlock opens the library.
 */

import type { ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

/** Drop a recording at public/demo/pen-tour.webm when ready. */
const DEMO_SRC = './demo/pen-tour.webm';

const CHECKLIST = [
  'Author anything',
  'Collaborate encrypted',
  'Publish to the network'
] as const;

/** Hand-drawn check — unicode ✓ ignores Caveat and looks system/printed. */
function HandCheck() {
  return (
    <svg
      className="pen-locked-copy-check"
      viewBox="0 0 32 26"
      width="1.2em"
      height="1em"
      aria-hidden
    >
      <path
        d="M2.5 13.5c1.8.4 3.2 1.6 4.6 3.4 1.2 1.5 2.4 3.8 3.7 6.6 1.8-4.8 4.2-9.2 7-12.6C21.2 6.8 25.4 3.6 29.5 2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M3.2 14.1c1.6.55 2.9 1.7 4.2 3.2 1.1 1.4 2.2 3.5 3.4 6.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

function PhoneEmbed() {
  return (
    <div className="pen-locked-phone" aria-label="Pen product preview">
      <div className="pen-locked-phone-notch" aria-hidden />
      <div className="pen-locked-phone-screen">
        <video
          className="pen-locked-phone-video"
          src={DEMO_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
        />
      </div>
    </div>
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
  const unlockConfig = {
    clientId: PN_CLIENT_ID,
    redirectUri: `${window.location.origin}/oauth-callback.html`,
    apiEndpoint: API_ENDPOINT,
    scope: ['openid', 'profile', 'cloud:read', 'cloud:app']
  };

  return (
    <div className="min-h-screen bg-white text-black">
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

      <div className="flex min-h-[calc(100vh-2.5rem)] flex-col pt-10">
        <div className="pen-library-page bg-white">
          <div className="pen-library-notebook flex-1">
            <div className="pen-library-notebook-inner">
              <div className="pen-explorer-rail" aria-hidden />

              <div className="pen-library-heading">
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-bold text-black">Pen</h1>
                  <p className="text-sm text-neutral-500">Encrypted collaboration through your cloud</p>
                </div>
              </div>

              <div className="pen-library-body">
                <div className="pen-library-sheet pen-locked-sheet">
                  <div className="pen-gallery-head" aria-hidden />
                  <div className="pen-library-title-rule" aria-hidden />

                  <div className="pen-locked-flow">
                    <ul className="pen-locked-checklist">
                      {CHECKLIST.map((label) => (
                        <li key={label} className="pen-locked-check-item">
                          <span className="pen-locked-copy-bullet" aria-hidden>
                            •
                          </span>
                          <span className="pen-locked-copy-text">{label}</span>
                          <HandCheck />
                        </li>
                      ))}
                      <li className="pen-locked-check-item">
                        <span className="pen-locked-copy-bullet" aria-hidden>
                          •
                        </span>
                        <span className="pen-locked-copy-text">Unlock pN to get started</span>
                      </li>
                      <li className="pen-locked-check-item pen-locked-check-item--cta">
                        <UnlockButton
                          className="pen-locked-unlock-cta"
                          config={unlockConfig}
                          onBeforeNavigate={onBeforeNavigate}
                          onPopupResult={onPopupResult}
                          onPopupFlowFailed={onPopupFlowFailed}
                          showIcon
                        >
                          Unlock pN
                        </UnlockButton>
                        {busy && (
                          <span className="pen-locked-copy-status">Finishing unlock…</span>
                        )}
                        {error && <span className="pen-locked-copy-error">{error}</span>}
                      </li>
                    </ul>

                    <aside className="pen-locked-phone-slot">
                      <PhoneEmbed />
                    </aside>
                  </div>
                </div>
              </div>

              <footer className="pen-library-footer">
                <p className="pen-library-footer-copy">© par Noir</p>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
