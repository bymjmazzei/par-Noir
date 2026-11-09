import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { PnOAuthPopupResult } from '@par-noir/oauth-ui';
import {
  createPnSession,
  exchangePortalAuthorizationCode,
  fetchPortalUserInfo,
  oauthStatesMatch,
  setPendingGrant,
  usePnSession,
  wipeThirdPartyCloudOnLock
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/client';

const STORAGE_OAUTH_CTX = 'dev_portal_oauth';
const STORAGE_POPUP_STATE = 'pn_oauth_state';

export const devPortalSession = createPnSession({
  clientId: PN_CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: 'dev_portal_session'
});

devPortalSession.onWipe(async () => {
  await wipeThirdPartyCloudOnLock(devPortalSession.load()?.pnIdentifier).catch(() => undefined);
  sessionStorage.removeItem(STORAGE_OAUTH_CTX);
  sessionStorage.removeItem(STORAGE_POPUP_STATE);
});

function getAccessToken(): string | null {
  return devPortalSession.load()?.accessToken ?? null;
}

export interface UserInfo {
  sub?: string;
  did?: string;
  pn_identifier?: string;
  nickname?: string;
}

export interface KeyRow {
  id: string;
  pnId: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface OAuthClientRow {
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes?: string[];
  ownerPnId?: string;
  isActive: boolean;
}

interface PortalContextValue {
  token: string | null;
  user: UserInfo | null;
  keys: KeyRow[];
  oauthClients: OAuthClientRow[];
  loadingSession: boolean;
  signedIn: boolean;
  message: string | null;
  setMessage: (m: string | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  authHeaders: () => HeadersInit;
  authHeadersAsync: () => Promise<HeadersInit>;
  completePortalOAuth: (result: PnOAuthPopupResult) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  handleBeforeUnlock: (state: string, nonce: string) => void;
  signOut: () => Promise<void>;
  onPopupResult: (r: PnOAuthPopupResult) => Promise<void>;
  apiEndpoint: string;
  clientId: string;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const session = usePnSession(devPortalSession);
  const token = session?.accessToken ?? null;
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClientRow[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bearer only. The /api/developer/* routes are Postgres-backed and never touch
  // Drive, so they must not depend on a cloud token being present.
  const authHeaders = useCallback((): HeadersInit => {
    const t = getAccessToken();
    if (!t) return { 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
  }, []);

  const authHeadersAsync = useCallback(async (): Promise<HeadersInit> => authHeaders(), [
    authHeaders
  ]);

  const completePortalOAuth = useCallback(async (result: PnOAuthPopupResult) => {
    if (result.error) {
      setError(result.error_description || result.error);
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    if (!result.code) return;
    const raw = sessionStorage.getItem(STORAGE_OAUTH_CTX);
    if (!raw) {
      setError('OAuth session expired. Try unlocking again.');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    let ctx: { state: string; clientId: string; redirectUri: string };
    try {
      ctx = JSON.parse(raw) as { state: string; clientId: string; redirectUri: string };
    } catch {
      setError('Invalid OAuth context');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    if (result.state !== undefined && !oauthStatesMatch(result.state, ctx.state)) {
      setError('Invalid OAuth state');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    try {
      const granted =
        typeof result.granted_data_points === 'string'
          ? result.granted_data_points.split(',').filter(Boolean)
          : undefined;
      const data = await exchangePortalAuthorizationCode({
        apiEndpoint: API_ENDPOINT,
        clientId: ctx.clientId || PN_CLIENT_ID,
        code: result.code,
        redirectUri: ctx.redirectUri,
        grantedDataPoints: granted
      });
      const info = (await fetchPortalUserInfo({
        apiEndpoint: API_ENDPOINT,
        accessToken: data.access_token
      })) as UserInfo;
      devPortalSession.begin(data, { pnIdentifier: info.pn_identifier || info.sub || 'unknown' });
      if (granted && granted.length > 0 && result.consent_shown === '1') {
        setPendingGrant(ctx.clientId || PN_CLIENT_ID, granted);
      }
      sessionStorage.removeItem(STORAGE_OAUTH_CTX);
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token exchange failed');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    let t = await devPortalSession.getAccessToken();
    if (!t) {
      setUser(null);
      setKeys([]);
      setOauthClients([]);
      return;
    }
    try {
      let info: UserInfo;
      try {
        info = (await fetchPortalUserInfo({ apiEndpoint: API_ENDPOINT, accessToken: t })) as UserInfo;
      } catch {
        t = await devPortalSession.getAccessToken({ forceRefresh: true });
        if (!t) return;
        info = (await fetchPortalUserInfo({ apiEndpoint: API_ENDPOINT, accessToken: t })) as UserInfo;
      }
      setUser(info);
      const headers = { Authorization: `Bearer ${t}` };
      const [kRes, cRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/api/developer/api-keys`, { headers }),
        fetch(`${API_ENDPOINT}/api/developer/oauth-clients`, { headers })
      ]);
      if (kRes.ok) {
        const kd = (await kRes.json()) as { keys?: KeyRow[] };
        setKeys(Array.isArray(kd.keys) ? kd.keys : []);
      } else {
        setKeys([]);
      }
      if (cRes.ok) {
        const cd = (await cRes.json()) as { clients?: OAuthClientRow[] };
        setOauthClients(Array.isArray(cd.clients) ? cd.clients : []);
      } else {
        setOauthClients([]);
      }
    } catch {
      setUser(null);
      setKeys([]);
      setOauthClients([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('oauth_resume') === '1') {
      const resumeResult: PnOAuthPopupResult = {
        code: params.get('code') || undefined,
        state: params.get('state') || undefined,
        error: params.get('error') || undefined,
        granted_data_points: params.get('granted_data_points') ?? undefined,
        consent_shown: params.get('consent_shown') === '1' ? '1' : undefined
      };
      void (async () => {
        try {
          setLoadingSession(true);
          await completePortalOAuth(resumeResult);
          await refreshDashboard();
        } finally {
          setLoadingSession(false);
          window.history.replaceState({}, '', window.location.pathname);
        }
      })();
      return;
    }

    const qErr = params.get('error');
    if (qErr) {
      setError(decodeURIComponent(qErr.replace(/\+/g, ' ')));
      window.history.replaceState({}, '', window.location.pathname);
    }
    void (async () => {
      setLoadingSession(true);
      await refreshDashboard();
      setLoadingSession(false);
    })();
  }, [refreshDashboard, completePortalOAuth]);

  const handleBeforeUnlock = useCallback((state: string, nonce: string) => {
    setError(null);
    setMessage(null);
    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    sessionStorage.setItem(
      STORAGE_OAUTH_CTX,
      JSON.stringify({ api: API_ENDPOINT, clientId: PN_CLIENT_ID, state, nonce, redirectUri })
    );
    sessionStorage.setItem(STORAGE_POPUP_STATE, state);
  }, []);

  const signOut = useCallback(() => devPortalSession.lock('manual'), []);

  const onPopupResult = useCallback(
    async (r: PnOAuthPopupResult) => {
      await completePortalOAuth(r);
      await refreshDashboard();
    },
    [completePortalOAuth, refreshDashboard]
  );

  const signedIn = Boolean(token) && !loadingSession;

  const value = useMemo<PortalContextValue>(
    () => ({
      token,
      user,
      keys,
      oauthClients,
      loadingSession,
      signedIn,
      message,
      setMessage,
      error,
      setError,
      authHeaders,
      authHeadersAsync,
      completePortalOAuth,
      refreshDashboard,
      handleBeforeUnlock,
      signOut,
      onPopupResult,
      apiEndpoint: API_ENDPOINT,
      clientId: PN_CLIENT_ID
    }),
    [
      token,
      user,
      keys,
      oauthClients,
      loadingSession,
      signedIn,
      message,
      error,
      authHeaders,
      authHeadersAsync,
      completePortalOAuth,
      refreshDashboard,
      handleBeforeUnlock,
      signOut,
      onPopupResult
    ]
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) {
    throw new Error('usePortal must be used within PortalProvider');
  }
  return ctx;
}
