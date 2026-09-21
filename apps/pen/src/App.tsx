/**
 * Pen app — flow-first document builder with collab + authenticity.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { UnlockButton, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from './config/api';
import { DocEditorPage } from './pages/DocEditorPage';
import { DocListPage } from './pages/DocListPage';
import { listLocalDocs, type LocalDocSummary } from './services/penLocalStore';

export interface PenSession {
  accessToken: string;
  pnIdentifier: string;
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
  mlKemSecretKey?: string;
}

function Locked() {
  const [session, setSession] = useState<PenSession | null>(null);
  const navigate = useNavigate();

  const onPopup = useCallback(async (r: PnOAuthPopupResult) => {
    if (!r.accessToken) return;
    const pn =
      (r as any).pnIdentifier ||
      (r as any).identityId ||
      (r as any).user?.pnIdentifier ||
      '';
    const handoff = (r as any).messagingHandoff?.session || (r as any).session;
    const next: PenSession = {
      accessToken: r.accessToken,
      pnIdentifier: String(pn || handoff?.pnIdentifier || 'unknown'),
      mlDsaPublicKey: handoff?.mlDsaPublicKey,
      mlDsaSecretKey: handoff?.mlDsaSecretKey,
      mlKemSecretKey: handoff?.mlKemSecretKey
    };
    sessionStorage.setItem('pen_session', JSON.stringify(next));
    setSession(next);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pen_session');
      if (raw) setSession(JSON.parse(raw) as PenSession);
    } catch {
      /* ignore */
    }
  }, []);

  if (session?.accessToken) {
    return <AuthenticatedApp session={session} onLock={() => {
      sessionStorage.removeItem('pen_session');
      setSession(null);
    }} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-neutral-950 text-white px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Pen</h1>
      <p className="text-neutral-400 text-center max-w-md">
        Authored content for par Noir — Notes, posts, feeds. Collaborate with people and agents.
      </p>
      <UnlockButton
        config={{
          clientId: PN_CLIENT_ID,
          redirectUri: `${window.location.origin}/oauth-callback.html`,
          apiEndpoint: API_ENDPOINT,
          scopes: ['openid', 'profile', 'cloud:read', 'cloud:app']
        }}
        onPopupResult={onPopup}
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
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Pen
        </Link>
        <button type="button" className="text-sm text-neutral-400 hover:text-white" onClick={onLock}>
          Lock
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
