/**
 * Pen app — flow-first document builder with collab + authenticity.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  LockButton,
  UnlockButton,
  ThirdPartyCloudReconnectHost,
  wipeThirdPartyCloudOnLock,
  exchangePortalAuthorizationCode,
  fetchPortalUserInfo,
  normalizeMessagingHandoffPayload,
  parseMessagingHandoffFromStorage,
  mergeMessagingSessionParts,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  hasCloudCredentialsReady,
  type PnOAuthPopupResult
} from '@par-noir/oauth-ui';
import { API_ENDPOINT, PN_CLIENT_ID } from './config/api';
import { DocEditorPage } from './pages/DocEditorPage';
import { DocListPage, type PenAddIntent } from './pages/DocListPage';
import { listLocalDocs, type LocalDocSummary, clearLocalDocsForPn } from './services/penLocalStore';
import {
  clearPenSession,
  loadPenSession,
  savePenSession,
  type PenSession
} from './services/penSession';
import { flushPenSyncQueue } from './services/penSyncFlush';
import { drainPenMailbox, clearPenMailboxSessionCache } from './services/penCollab';
import { listLibraryCloud } from './services/penCloudStore';
import { pendingSyncCount } from './services/penSyncQueue';
import { PenLockedLanding } from './components/PenLockedLanding';
import { TemplatesBrowse } from './components/TemplatesBrowse';
import { loadBrowseDensity, saveBrowseDensity, type PenBrowseDensity } from './services/penClassPrefs';
import { clearDocKeysForSession } from './services/penDocCrypto';
import {
  bindPrefsCloudSession,
  pullAndMergePrefsCloud,
  unbindPrefsCloudSession
} from './services/penPrefsCloud';

export type { PenSession };

const OAUTH_STATE_KEY = 'pen_oauth_state';

/** ML-KEM from OAuth messaging handoff — required to unseal the cloud vault. */
function peekMlKemSecretKey(messagingHandoff?: unknown): string | undefined {
  const fromResult = normalizeMessagingHandoffPayload(messagingHandoff);
  if (fromResult?.session?.mlKemSecretKey) return fromResult.session.mlKemSecretKey;
  try {
    return (
      parseMessagingHandoffFromStorage(
        localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE)
      )?.session?.mlKemSecretKey ?? undefined
    );
  } catch {
    return undefined;
  }
}

function handoffSessionFields(messagingHandoff?: unknown): {
  mlKemSecretKey?: string;
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
} {
  const fromResult = normalizeMessagingHandoffPayload(messagingHandoff)?.session;
  let fromStorage:
    | { mlKemSecretKey: string; mlKemPublicKey?: string; mlDsaSecretKey?: string; mlDsaPublicKey?: string }
    | undefined;
  try {
    fromStorage = parseMessagingHandoffFromStorage(
      localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE)
    )?.session;
  } catch {
    fromStorage = undefined;
  }
  const merged = mergeMessagingSessionParts(fromResult, fromStorage);
  if (!merged?.mlKemSecretKey) {
    const peeked = peekMlKemSecretKey(messagingHandoff);
    if (!peeked) return {};
    return { mlKemSecretKey: peeked };
  }
  const out: {
    mlKemSecretKey: string;
    mlDsaPublicKey?: string;
    mlDsaSecretKey?: string;
  } = { mlKemSecretKey: merged.mlKemSecretKey };
  if (merged.mlDsaPublicKey && merged.mlDsaSecretKey) {
    out.mlDsaPublicKey = merged.mlDsaPublicKey;
    out.mlDsaSecretKey = merged.mlDsaSecretKey;
  }
  return out;
}

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
      // Drive sync waits for ThirdPartyCloudReconnectHost → cloud credentials ready
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

        const handoffFields = handoffSessionFields(r.messagingHandoff);

        const pn =
          String(
            user.pn_identifier ||
              user.sub ||
              ''
          ).trim() || 'unknown';

        applySession({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          pnIdentifier: pn,
          ...handoffFields
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
    }
  }, []);

  if (session?.accessToken) {
    return (
      <AuthenticatedApp
        session={session}
        onLock={async () => {
          await wipeThirdPartyCloudOnLock(session.pnIdentifier);
          clearDocKeysForSession();
          clearLocalDocsForPn(session.pnIdentifier);
          clearPenMailboxSessionCache(session.pnIdentifier);
          clearPenSession();
          setSession(null);
          setLockedView('home');
        }}
      />
    );
  }

  const lockedUnlock = {
    onBeforeNavigate: (state: string) => {
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      setError(null);
    },
    onPopupResult: onPopup,
    onPopupFlowFailed: (reason: string) => setError(reason)
  };

  if (lockedView === 'templates') {
    return (
      <div className="min-h-screen bg-white text-black">
        <header className="pen-app-chrome fixed inset-x-0 top-0 z-50">
          <div className="pen-app-chrome-left">
            <span className="pen-app-chrome-action" aria-hidden />
            <AddMenu templatesOnly onSelect={() => setLockedView('templates')} />
            <button
              type="button"
              className="pen-app-chrome-brand"
              onClick={() => setLockedView('home')}
            >
              Pen
            </button>
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
            {...lockedUnlock}
          />
        </header>
        <div className="flex min-h-[calc(100vh-2.5rem)] flex-col pt-10">
          <div className="pen-library-page bg-white">
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
        </div>
      </div>
    );
  }

  return (
    <PenLockedLanding
      busy={busy}
      error={error}
      onBeforeNavigate={lockedUnlock.onBeforeNavigate}
      onPopupResult={lockedUnlock.onPopupResult}
      onPopupFlowFailed={lockedUnlock.onPopupFlowFailed}
      addMenu={
        <AddMenu templatesOnly onSelect={() => setLockedView('templates')} />
      }
    />
  );
}

function AddMenu({
  onSelect,
  templatesOnly = false
}: {
  onSelect: (intent: PenAddIntent) => void;
  templatesOnly?: boolean;
}) {
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
          {!templatesOnly && (
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
          )}
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
          {!templatesOnly && (
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
          )}
        </div>
      )}
    </div>
  );
}

function AuthenticatedApp({
  session,
  onLock
}: {
  session: PenSession;
  onLock: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<LocalDocSummary[]>([]);
  const [addIntent, setAddIntent] = useState<PenAddIntent | null>(null);
  const [syncPending, setSyncPending] = useState(0);
  const [mlKemSecretKey, setMlKemSecretKey] = useState<string | null>(
    () => session.mlKemSecretKey || peekMlKemSecretKey() || null
  );

  useEffect(() => {
    if (mlKemSecretKey) return;
    const peeked = session.mlKemSecretKey || peekMlKemSecretKey();
    if (peeked) setMlKemSecretKey(peeked);
  }, [session.mlKemSecretKey, mlKemSecretKey]);

  useEffect(() => {
    if (!mlKemSecretKey) {
      unbindPrefsCloudSession();
      return;
    }
    bindPrefsCloudSession({
      pnIdentifier: session.pnIdentifier,
      mlKemSecretKey
    });
    const pull = () => {
      if (!hasCloudCredentialsReady(session.pnIdentifier)) return;
      void pullAndMergePrefsCloud({
        pnIdentifier: session.pnIdentifier,
        mlKemSecretKey
      }).catch(() => {
        /* offline / missing file */
      });
    };
    pull();
    const onCloudReady = () => pull();
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudReady);
    return () => {
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudReady);
      unbindPrefsCloudSession();
    };
  }, [session.pnIdentifier, mlKemSecretKey]);

  const refreshDocsInFlight = useRef<Promise<void> | null>(null);

  const refreshDocs = useCallback(async (opts?: { forceCloud?: boolean }) => {
    const local = listLocalDocs(session.pnIdentifier);
    setDocs(local);
    setSyncPending(pendingSyncCount(session.pnIdentifier));
    if (!hasCloudCredentialsReady(session.pnIdentifier) && !opts?.forceCloud) return;
    if (refreshDocsInFlight.current) return refreshDocsInFlight.current;
    const run = (async () => {
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
      } finally {
        refreshDocsInFlight.current = null;
      }
    })();
    refreshDocsInFlight.current = run;
    return run;
  }, [session.pnIdentifier]);

  const removeDocsFromList = useCallback((docIds: string[]) => {
    const remove = new Set(docIds);
    setDocs((prev) => prev.filter((d) => !remove.has(d.docId)));
    setSyncPending(pendingSyncCount(session.pnIdentifier));
  }, [session.pnIdentifier]);

  useEffect(() => {
    // Local index immediately; cloud library only after vault/credentials are ready.
    void refreshDocs();
    const onOnline = () => {
      if (!hasCloudCredentialsReady(session.pnIdentifier)) return;
      void flushPenSyncQueue(session).then(() => refreshDocs({ forceCloud: true }));
      void drainPenMailbox(session);
    };
    const onCloudReady = () => {
      void flushPenSyncQueue(session).then(() => refreshDocs({ forceCloud: true }));
      void drainPenMailbox(session);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudReady);
    const t = window.setInterval(() => {
      if (!hasCloudCredentialsReady(session.pnIdentifier)) {
        setSyncPending(pendingSyncCount(session.pnIdentifier));
        return;
      }
      void flushPenSyncQueue(session);
      void drainPenMailbox(session);
      setSyncPending(pendingSyncCount(session.pnIdentifier));
    }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudReady);
      window.clearInterval(t);
    };
  }, [session, refreshDocs]);

  function requestAdd(intent: PenAddIntent) {
    navigate('/');
    setAddIntent(intent);
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <ThirdPartyCloudReconnectHost
        apiEndpoint={API_ENDPOINT}
        authToken={session.accessToken}
        pnIdentifier={session.pnIdentifier}
        mlKemSecretKey={mlKemSecretKey}
      />
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
        <LockButton
          className="pen-app-chrome-lock"
          onLock={onLock}
          refreshToken={session.refreshToken}
          apiEndpoint={API_ENDPOINT}
          title="Lock session"
          showIcon
        >
          {false}
        </LockButton>
      </header>
      <div className="flex min-h-[calc(100vh-2.5rem)] flex-col pt-10">
        <Routes>
          <Route
            path="/"
            element={
              <DocListPage
                session={session}
                docs={docs}
                onDocsChange={() => void refreshDocs({ forceCloud: true })}
                onDocsRemoved={removeDocsFromList}
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
