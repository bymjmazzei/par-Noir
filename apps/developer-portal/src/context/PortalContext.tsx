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
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/client';

const STORAGE_ACCESS = 'dev_portal_access_token';
const STORAGE_REFRESH = 'dev_portal_refresh_token';
const STORAGE_OAUTH_CTX = 'dev_portal_oauth';
const STORAGE_POPUP_STATE = 'pn_oauth_state';

function oauthStatesMatch(incoming: string, expected: string): boolean {
  const a = incoming.trim();
  const b = expected.trim();
  if (a === b) return true;
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return false;
  }
}

export function getAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const t = sessionStorage.getItem(STORAGE_ACCESS);
  return t && t.trim() ? t.trim() : null;
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
  sessionStorage.removeItem(STORAGE_OAUTH_CTX);
  sessionStorage.removeItem(STORAGE_POPUP_STATE);
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
  completePortalOAuth: (result: PnOAuthPopupResult) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  handleBeforeUnlock: (state: string, nonce: string) => void;
  signOut: () => Promise<void>;
  onPopupResult: (r: PnOAuthPopupResult) => Promise<void>;
  apiEndpoint: string;
  clientId: string;
}

const PortalContext = createContext<PortalContextValue | null>(null);

/** Persist access + refresh from /oauth/refresh (required when API rotates refresh tokens). */
async function tryRefreshDeveloperPortalAccessToken(): Promise<string | null> {
  if (typeof sessionStorage === 'undefined') return null;
  const refresh = sessionStorage.getItem(STORAGE_REFRESH);
  if (!refresh?.trim()) return null;
  const res = await fetch(`${API_ENDPOINT}/oauth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refresh.trim(),
      client_id: PN_CLIENT_ID
    })
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) return null;
  sessionStorage.setItem(STORAGE_ACCESS, data.access_token);
  if (data.refresh_token) {
    sessionStorage.setItem(STORAGE_REFRESH, data.refresh_token);
  }
  return data.access_token;
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClientRow[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const t = getAccessToken();
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (t) {
      (h as Record<string, string>)['Authorization'] = `Bearer ${t}`;
    }
    return h;
  }, []);

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
    if (result.state !== undefined && result.state !== ctx.state) {
      setError('Invalid OAuth state');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    const body: Record<string, unknown> = {
      code: result.code,
      client_id: ctx.clientId,
      redirect_uri: ctx.redirectUri,
      grant_type: 'authorization_code'
    };
    if (result.age_shared === 'true') {
      body.age_shared = true;
    }
    const tokenRes = await fetch(`${API_ENDPOINT}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
      error?: string;
    };
    if (!tokenRes.ok) {
      setError(data.error_description || data.error || 'Token exchange failed');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    if (data.access_token) {
      sessionStorage.setItem(STORAGE_ACCESS, data.access_token);
    }
    if (data.refresh_token) {
      sessionStorage.setItem(STORAGE_REFRESH, data.refresh_token);
    }
    sessionStorage.removeItem(STORAGE_OAUTH_CTX);
    sessionStorage.removeItem(STORAGE_POPUP_STATE);
    setToken(data.access_token ?? null);
    setError(null);
  }, []);

  const refreshDashboard = useCallback(async () => {
    let t = getAccessToken();
    if (!t) {
      setUser(null);
      setKeys([]);
      setOauthClients([]);
      setToken(null);
      return;
    }
    setToken(t);
    try {
      const fetchAll = (access: string) =>
        Promise.all([
          fetch(`${API_ENDPOINT}/oauth/userinfo`, { headers: { Authorization: `Bearer ${access}` } }),
          fetch(`${API_ENDPOINT}/api/developer/api-keys`, { headers: { Authorization: `Bearer ${access}` } }),
          fetch(`${API_ENDPOINT}/api/developer/oauth-clients`, { headers: { Authorization: `Bearer ${access}` } })
        ]);
      let [uRes, kRes, cRes] = await fetchAll(t);
      if (uRes.status === 401) {
        const newAccess = await tryRefreshDeveloperPortalAccessToken();
        if (newAccess) {
          setToken(newAccess);
          [uRes, kRes, cRes] = await fetchAll(newAccess);
        }
      }
      if (uRes.status === 401) {
        clearSession();
        setUser(null);
        setKeys([]);
        setOauthClients([]);
        setToken(null);
        return;
      }
      if (uRes.ok) {
        setUser((await uRes.json()) as UserInfo);
      } else {
        setUser(null);
      }
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
        age_shared: params.get('age_shared') || undefined
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

  const signOut = useCallback(async () => {
    const refresh = sessionStorage.getItem(STORAGE_REFRESH);
    if (refresh) {
      try {
        await fetch(`${API_ENDPOINT}/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: refresh, token_type_hint: 'refresh_token' })
        });
      } catch {
        /* best-effort */
      }
    }
    clearSession();
    setToken(null);
    setUser(null);
    setKeys([]);
    setOauthClients([]);
    setMessage(null);
  }, []);

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
