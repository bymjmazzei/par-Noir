/**
 * Locked Pen — same chrome + notebook rules as My Library; unlock opens the library.
 */

import type { ReactNode } from 'react';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

/** Drop a recording at public/demo/pen-tour.webm when ready. */
const DEMO_SRC = './demo/pen-tour.webm';

/** One short phrase per ruled row. */
const COPY_LINES = [
  'Write Notes, posts, and projects.',
  'Invite others to draft with you.',
  'Publish to your own cloud.',
  'Unlock to open My Library.',
  'Use + to browse templates.'
];

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
  const lines = [...COPY_LINES];
  if (busy) lines.push('Finishing unlock…');
  if (error) lines.push(error);

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
          config={{
            clientId: PN_CLIENT_ID,
            redirectUri: `${window.location.origin}/oauth-callback.html`,
            apiEndpoint: API_ENDPOINT,
            scope: ['openid', 'profile', 'cloud:read', 'cloud:app']
          }}
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
                  <p className="text-sm text-neutral-500">Your writing, on your Drive.</p>
                </div>
              </div>

              <div className="pen-library-body">
                <div className="pen-library-sheet pen-locked-sheet">
                  <div className="pen-explorer pen-locked-explorer">
                    <div className="pen-gallery-head" aria-hidden />
                    <div className="pen-library-title-rule" aria-hidden />

                    <div className="pen-explorer-body">
                      <div className="pen-explorer-scroll">
                        <table className="pen-explorer-table text-left text-sm">
                          <tbody>
                            {lines.map((line, i) => {
                              const isError = Boolean(error && line === error);
                              const isStatus = Boolean(busy && line === 'Finishing unlock…');
                              return (
                                <tr key={`${i}-${line.slice(0, 24)}`} className="pen-explorer-row">
                                  <td className="pen-explorer-action" />
                                  <td className="pen-explorer-icon" />
                                  <td
                                    className={`pen-explorer-name-cell${
                                      isError
                                        ? ' pen-locked-copy-error'
                                        : isStatus
                                          ? ' pen-locked-copy-status'
                                          : ''
                                    }`}
                                  >
                                    <span className="pen-locked-copy-text">{line}</span>
                                  </td>
                                </tr>
                              );
                            })}
                            {Array.from({ length: 14 }).map((_, i) => (
                              <tr key={`pad-${i}`} className="pen-explorer-row">
                                <td className="pen-explorer-action" />
                                <td className="pen-explorer-icon" />
                                <td className="pen-explorer-name-cell" />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="pen-locked-phone-overlay">
                    <PhoneEmbed />
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
