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
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-stone-200 px-6">
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Pen</h1>
      <p className="max-w-sm text-center text-sm text-stone-600">
        Document editor for Notes, posts, and feeds.
      </p>
      {error && <p className="max-w-md text-center text-sm text-red-600">{error}</p>}
      {busy && <p className="text-sm text-stone-500">Finishing unlock…</p>}
      <UnlockButton
        className="inline-flex items-center rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
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
  const [docs, setDocs] = useState<LocalDocSummary[]>([]);
  useEffect(() => {
    setDocs(listLocalDocs(session.pnIdentifier));
  }, [session.pnIdentifier]);

  return (
    <div className="min-h-screen bg-stone-200 text-stone-900">
      <header className="flex h-10 items-center justify-between border-b border-stone-400 bg-stone-100 px-3">
        <Link to="/" className="text-sm font-semibold tracking-tight text-stone-900">
          Pen
        </Link>
        <button
          type="button"
          onClick={onLock}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-stone-600 hover:bg-stone-200"
          title="Lock session"
          aria-label="Lock session"
        >
          <LockIcon className="h-4 w-4" />
        </button>
      </header>
      <Routes>
        <Route
          path="/"
          element={
            <DocListPage
              session={session}
              docs={docs}
              onDocsChange={() => setDocs(listLocalDocs(session.pnIdentifier))}
            />
          }
        />
        <Route path="/d/:docId" element={<DocEditorRoute session={session} />} />
      </Routes>
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
