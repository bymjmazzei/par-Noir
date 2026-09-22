/**
 * Locked Pen — title card, then ruled notebook sheet with in-line copy.
 */

import type { ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

const CHECKLIST = [
  'Author anything',
  'encrypted collaboration',
  'customize your feed posts',
  'publish to your networks'
] as const;

const LOGO_SRC = './branding/Par-Noir-Logo-Black.png';

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
  const unlockConfig = {
    clientId: PN_CLIENT_ID,
    redirectUri: `${window.location.origin}/oauth-callback.html`,
    apiEndpoint: API_ENDPOINT,
    scope: ['openid', 'profile', 'cloud:read', 'cloud:app']
  };

  return (
    <div className="pen-locked-page bg-white text-black">
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
              <div className="pen-explorer-rail" aria-hidden />

              {/* Title card — no notebook rules */}
              <div className="pen-locked-heading">
                <h1 className="pen-locked-title">Pen</h1>
                <p className="pen-locked-subtitle">
                  Encrypted collaboration published through your cloud
                </p>
              </div>

              {/* Ruled sheet starts here and stops where the footer begins */}
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

              <footer className="pen-locked-footer">
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
