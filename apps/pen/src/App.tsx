/**
 * Pen app — flow-first document builder with collab + authenticity.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  LockIcon,
  exchangePortalAuthorizationCode,
  fetchPortalUserInfo,
  type PnOAuthPopupResult
} from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from './config/api';
import { DocEditorPage } from './pages/DocEditorPage';
import { DocListPage, type PenAddIntent } from './pages/DocListPage';
import { listLocalDocs, type LocalDocSummary } from './services/penLocalStore';
import {
  clearPenSession,
  loadPenSession,
  savePenSession,
  type PenSession
} from './services/penSession';
import { flushPenSyncQueue } from './services/penSyncFlush';
import { drainPenMailbox } from './services/penCollab';
import { listLibraryCloud } from './services/penCloudStore';
import { pendingSyncCount } from './services/penSyncQueue';
import { PenLockedLanding } from './components/PenLockedLanding';
import { TemplatesBrowse } from './components/TemplatesBrowse';
import { loadBrowseDensity, saveBrowseDensity, type PenBrowseDensity } from './services/penClassPrefs';

export type { PenSession };

const OAUTH_STATE_KEY = 'pen_oauth_state';

function Locked() {
  const [session, setSession] = useState<PenSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedView, setLockedView] = useState<'home' | 'templates'>('home');
  const [templateDensity, setTemplateDensity] = useState<PenBrowseDensity>(() =>
    loadBrowseDensity('_locked')
  );
  const navigate = useNavigate();

  const applySession = useCallback(
    (next: PenSession) => {
      savePenSession(next);
      setSession(next);
      setLockedView('home');
      navigate('/');
      void flushPenSyncQueue(next);
      void drainPenMailbox(next);
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
    const existing = loadPenSession();
    if (existing) {
      setSession(existing);
      void flushPenSyncQueue(existing);
      void drainPenMailbox(existing);
    }
  }, []);

  if (session?.accessToken) {
    return (
      <AuthenticatedApp
        session={session}
        onLock={() => {
          clearPenSession();
          setSession(null);
          setLockedView('home');
        }}
      />
    );
  }

  if (lockedView === 'templates') {
    return (
      <div className="pen-library-page min-h-screen bg-white">
        <div className="pen-library-notebook flex-1">
          <div className="pen-library-notebook-inner">
            <div className="pen-explorer-rail" aria-hidden />
            <TemplatesBrowse
              session={null}
              density={templateDensity}
              onDensity={(d) => {
                setTemplateDensity(d);
                saveBrowseDensity('_locked', d);
              }}
              onBack={() => setLockedView('home')}
              onCreated={(_docId) => undefined}
              onRequestUnlock={() => setLockedView('home')}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PenLockedLanding
      busy={busy}
      error={error}
      onBeforeNavigate={(state) => {
        sessionStorage.setItem(OAUTH_STATE_KEY, state);
        setError(null);
      }}
      onPopupResult={onPopup}
      onPopupFlowFailed={(reason) => setError(reason)}
      onSeeTemplates={() => setLockedView('templates')}
    />
  );
}

function AddMenu({ onSelect }: { onSelect: (intent: PenAddIntent) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="pen-add-menu" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Add"
        aria-label="Add"
        aria-expanded={open}
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
      {open && (
        <div className="pen-add-menu-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect('notebook');
            }}
          >
            New notebook
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect('templates');
            }}
          >
            See templates
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect('my-templates');
            }}
          >
            My templates
          </button>
        </div>
      )}
    </div>
  );
}

function AuthenticatedApp({ session, onLock }: { session: PenSession; onLock: () => void }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<LocalDocSummary[]>([]);
  const [addIntent, setAddIntent] = useState<PenAddIntent | null>(null);
  const [syncPending, setSyncPending] = useState(0);

  const refreshDocs = useCallback(async () => {
    const local = listLocalDocs(session.pnIdentifier);
    setDocs(local);
    setSyncPending(pendingSyncCount(session.pnIdentifier));
    try {
      const cloud = await listLibraryCloud(session.pnIdentifier);
      const byId = new Map<string, LocalDocSummary>();
      for (const d of cloud) byId.set(d.docId, d);
      for (const d of local) {
        const prev = byId.get(d.docId);
        if (!prev || (d.updatedAt || '') > (prev.updatedAt || '')) byId.set(d.docId, d);
      }
      setDocs([...byId.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    } catch {
      /* offline — keep local buffer */
    }
  }, [session.pnIdentifier]);

  useEffect(() => {
    void refreshDocs();
    const onOnline = () => {
      void flushPenSyncQueue(session).then(() => refreshDocs());
      void drainPenMailbox(session);
    };
    window.addEventListener('online', onOnline);
    const t = window.setInterval(() => {
      void flushPenSyncQueue(session);
      void drainPenMailbox(session);
      setSyncPending(pendingSyncCount(session.pnIdentifier));
    }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(t);
    };
  }, [session, refreshDocs]);

  function requestAdd(intent: PenAddIntent) {
    navigate('/');
    setAddIntent(intent);
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="pen-app-chrome fixed inset-x-0 top-0 z-50">
        <div className="pen-app-chrome-left">
          <span className="pen-app-chrome-action" aria-hidden />
          <AddMenu onSelect={requestAdd} />
          <Link to="/" className="pen-app-chrome-brand">
            Pen
          </Link>
          {syncPending > 0 && (
            <span className="ml-2 text-[11px] text-amber-800" title="Pending cloud sync">
              {syncPending} pending sync
            </span>
          )}
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
                onDocsChange={() => void refreshDocs()}
                addIntent={addIntent}
                onAddIntentConsumed={() => setAddIntent(null)}
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
