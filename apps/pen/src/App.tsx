/**
 * Pen app — flow-first document builder with collab + authenticity.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  UnlockButton,
  LockIcon,
  exchangePortalAuthorizationCode,
  fetchPortalUserInfo,
  type PnOAuthPopupResult
} from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from './config/api';
import { DocEditorPage } from './pages/DocEditorPage';
import { DocListPage } from './pages/DocListPage';
import { listLocalDocs, type LocalDocSummary } from './services/penLocalStore';

export interface PenSession {
  accessToken: string;
  refreshToken?: string;
  pnIdentifier: string;
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
  mlKemSecretKey?: string;
}

const SESSION_KEY = 'pen_session';
const OAUTH_STATE_KEY = 'pen_oauth_state';

function Locked() {
  const [session, setSession] = useState<PenSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const applySession = useCallback(
    (next: PenSession) => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      navigate('/');
    },
    [navigate]
  );

  const onPopup = useCallback(
    async (r: PnOAuthPopupResult) => {
      setError(null);
      if (r.error) {
        setError(r.error_description || r.error);
        return;
      }
      if (!r.code) {
        setError('Sign-in did not return an authorization code. Try again.');
        return;
      }

      setBusy(true);
      try {
        const redirectUri = `${window.location.origin}/oauth-callback.html`;
        const tokens = await exchangePortalAuthorizationCode({
          apiEndpoint: API_ENDPOINT,
          clientId: PN_CLIENT_ID,
          code: r.code,
          redirectUri
        });

        const user = await fetchPortalUserInfo({
          apiEndpoint: API_ENDPOINT,
          accessToken: tokens.access_token
        });

        const handoff =
          (r.messagingHandoff as { session?: Record<string, unknown> } | undefined)?.session ||
          (r.messagingHandoff as Record<string, unknown> | undefined);

        const pn =
          String(
            user.pn_identifier ||
              user.sub ||
              (handoff as { pnIdentifier?: string } | undefined)?.pnIdentifier ||
              ''
          ).trim() || 'unknown';

        applySession({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          pnIdentifier: pn,
          mlDsaPublicKey: (handoff as { mlDsaPublicKey?: string } | undefined)?.mlDsaPublicKey,
          mlDsaSecretKey: (handoff as { mlDsaSecretKey?: string } | undefined)?.mlDsaSecretKey,
          mlKemSecretKey: (handoff as { mlKemSecretKey?: string } | undefined)?.mlKemSecretKey
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unlock failed');
      } finally {
        setBusy(false);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
      }
    },
    [applySession]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as PenSession);
    } catch {
      /* ignore */
    }
  }, []);

  if (session?.accessToken) {
    return (
      <AuthenticatedApp
        session={session}
        onLock={() => {
          sessionStorage.removeItem(SESSION_KEY);
          setSession(null);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6">
      <h1 className="text-4xl font-semibold tracking-tight text-black">Pen</h1>
      <p className="max-w-sm text-center text-sm text-neutral-500">
        Document editor for Notes, posts, and feeds.
      </p>
      {error && <p className="max-w-md text-center text-sm text-red-600">{error}</p>}
      {busy && <p className="text-sm text-neutral-500">Finishing unlock…</p>}
      <UnlockButton
        className="inline-flex items-center text-sm font-bold text-black hover:opacity-70"
        config={{
          clientId: PN_CLIENT_ID,
          redirectUri: `${window.location.origin}/oauth-callback.html`,
          apiEndpoint: API_ENDPOINT,
          scopes: ['openid', 'profile', 'cloud:read', 'cloud:app']
        }}
        onBeforeNavigate={(state) => {
          sessionStorage.setItem(OAUTH_STATE_KEY, state);
          setError(null);
        }}
        onPopupResult={onPopup}
        onPopupFlowFailed={(reason) => setError(reason)}
      />
    </div>
  );
}

function AuthenticatedApp({ session, onLock }: { session: PenSession; onLock: () => void }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<LocalDocSummary[]>([]);
  const [newDocTick, setNewDocTick] = useState(0);
  useEffect(() => {
    setDocs(listLocalDocs(session.pnIdentifier));
  }, [session.pnIdentifier]);

  function requestNewDoc() {
    navigate('/');
    setNewDocTick((n) => n + 1);
  }

  function consumeNewDocTick() {
    setNewDocTick(0);
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="pen-app-chrome fixed inset-x-0 top-0 z-50">
        <div className="pen-app-chrome-left">
          <span className="pen-app-chrome-action" aria-hidden />
          <button
            type="button"
            onClick={requestNewDoc}
            title="New document"
            aria-label="New document"
            className="pen-app-chrome-icon"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Link to="/" className="pen-app-chrome-brand">
            Pen
          </Link>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="pen-app-chrome-lock"
          title="Lock session"
          aria-label="Lock session"
        >
          <LockIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="flex min-h-[calc(100vh-2.5rem)] flex-col pt-10">
        <Routes>
          <Route
            path="/"
            element={
              <DocListPage
                session={session}
                docs={docs}
                onDocsChange={() => setDocs(listLocalDocs(session.pnIdentifier))}
                newDocTick={newDocTick}
                onNewDocTickConsumed={consumeNewDocTick}
              />
            }
          />
          <Route path="/d/:docId" element={<DocEditorRoute session={session} />} />
        </Routes>
      </div>
    </div>
  );
}

function DocEditorRoute({ session }: { session: PenSession }) {
  const { docId } = useParams();
  if (!docId) return null;
  return <DocEditorPage session={session} docId={docId} />;
}

export default function App() {
  return <Locked />;
}
