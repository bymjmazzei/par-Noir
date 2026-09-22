/**
 * Locked Pen marketing / overview — unlock opens My Library.
 */

import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';

export function PenLockedLanding({
  busy,
  error,
  onBeforeNavigate,
  onPopupResult,
  onPopupFlowFailed,
  onSeeTemplates
}: {
  busy: boolean;
  error: string | null;
  onBeforeNavigate: (state: string) => void;
  onPopupResult: (r: PnOAuthPopupResult) => void;
  onPopupFlowFailed: (reason: string) => void;
  onSeeTemplates: () => void;
}) {
  return (
    <div className="pen-locked-page">
      <header className="pen-locked-chrome">
        <span className="pen-locked-brand">Pen</span>
        <div className="pen-locked-chrome-actions">
          <button type="button" className="pen-locked-text-btn" onClick={onSeeTemplates}>
            See templates
          </button>
          <UnlockButton
            className="pen-locked-text-btn pen-locked-text-btn--strong"
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
        </div>
      </header>

      <main className="pen-locked-main">
        <section className="pen-locked-hero">
          <h1 className="pen-locked-hero-brand">Pen</h1>
          <p className="pen-locked-hero-lead">
            Author Notes, posts, collections, and projects in one place — with drafts, live publish,
            and roles for collaborators.
          </p>
          <div className="pen-locked-cta-row">
            <UnlockButton
              className="pen-locked-cta"
              config={{
                clientId: PN_CLIENT_ID,
                redirectUri: `${window.location.origin}/oauth-callback.html`,
                apiEndpoint: API_ENDPOINT,
                scope: ['openid', 'profile', 'cloud:read', 'cloud:app']
              }}
              onBeforeNavigate={onBeforeNavigate}
              onPopupResult={onPopupResult}
              onPopupFlowFailed={onPopupFlowFailed}
            >
              Unlock
            </UnlockButton>
            <button type="button" className="pen-locked-cta pen-locked-cta--ghost" onClick={onSeeTemplates}>
              See templates
            </button>
          </div>
          {busy && <p className="pen-locked-status">Finishing unlock…</p>}
          {error && <p className="pen-locked-error">{error}</p>}
        </section>

        <section className="pen-locked-sections">
          <article>
            <h2>Write</h2>
            <p>
              Flow documents with TipTap sections, page layers, and starter templates across Social,
              Projects, Library, and Time.
            </p>
          </article>
          <article>
            <h2>Collaborate</h2>
            <p>
              Invite by role — owner, collaborator, commentor, or viewer. Drafts stay unfinished
              suggestions until accepted into the live version.
            </p>
          </article>
          <article>
            <h2>Publish</h2>
            <p>
              Publish live to your cloud replica, then optionally connect to your feed for public
              visibility. Your Drive remains the source of truth.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
