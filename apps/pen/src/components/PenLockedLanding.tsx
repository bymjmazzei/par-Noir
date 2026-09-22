/**
 * Locked Pen — same chrome + notebook rules as My Library; unlock opens the library.
 */

import type { ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

const CHECKLIST = [
  'Author anything',
  'Collaborate encrypted',
  'Publish to the network'
] as const;

const LOGO_SRC = './branding/Par-Noir-Logo-Black.png';

/** Irregular ink outline so the CTA reads hand-drawn, not a system button. */
function HandDrawnOutline() {
  return (
    <svg
      className="pen-locked-cta-outline"
      viewBox="0 0 320 52"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M14 12.5c22-5.5 78-9 148-8.5 52 .4 98 3.2 128 7.2 7.2 1 14.5 4.2 16.2 10.2 1.6 5.6-2.4 11.4-9.2 14.6-12.8 6-48 9.4-106 10.4-62 1-128-1.2-168-6.8C12 37.2 5.2 32.4 4.4 25.6 3.5 17.8 8.2 13.6 14 12.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M18 13.2c28-4.8 86-7.6 150-7 48 .5 92 2.8 120 6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.4"
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

      <div className="pen-locked-page-body flex flex-col">
        <div className="pen-library-page bg-white">
          <div className="pen-library-notebook flex-1">
            <div className="pen-library-notebook-inner">
              <div className="pen-explorer-rail" aria-hidden />

              <div className="pen-library-heading pen-locked-heading">
                <div className="min-w-0 flex-1">
                  <h1 className="pen-locked-title">Pen</h1>
                  <img
                    className="pen-locked-logo"
                    src={LOGO_SRC}
                    alt="par Noir"
                    width={160}
                    height={48}
                    decoding="async"
                  />
                  <p className="pen-locked-subtitle">
                    Encrypted collaboration published through your cloud
                  </p>
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
                        </li>
                      ))}
                      <li className="pen-locked-check-item pen-locked-check-item--cta">
                        <span className="pen-locked-cta-wrap">
                          <HandDrawnOutline />
                          <UnlockButton
                            className="pen-locked-unlock-cta"
                            config={unlockConfig}
                            onBeforeNavigate={onBeforeNavigate}
                            onPopupResult={onPopupResult}
                            onPopupFlowFailed={onPopupFlowFailed}
                            showIcon={false}
                            title="customize your feed posts"
                          >
                            customize your feed posts
                          </UnlockButton>
                        </span>
                        {busy && (
                          <span className="pen-locked-copy-status">Finishing unlock…</span>
                        )}
                        {error && <span className="pen-locked-copy-error">{error}</span>}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
