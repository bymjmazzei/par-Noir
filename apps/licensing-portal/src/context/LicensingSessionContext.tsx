import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  getOAuthResumeSearchParams,
  isOAuthResumeUrl,
  PN_OAUTH_RESUME_SEARCH_KEY,
  type PnOAuthPopupResult
} from '@par-noir/oauth-ui';
import { ownerCloudHeaders, ownerCloudHeadersAsync } from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/client';

const STORAGE_ACCESS = 'licensing_portal_access_token';
const STORAGE_REFRESH = 'licensing_portal_refresh_token';
const STORAGE_OAUTH_CTX = 'licensing_portal_oauth_ctx';
const STORAGE_POPUP_STATE = 'pn_oauth_state';
/** Prevents double token exchange (popup + opener nav race). */
const STORAGE_PROCESSED_CODE = 'licensing_portal_oauth_code_done';
/** Cross-mount guard while oauth_resume exchange runs. */
const STORAGE_RESUME_INFLIGHT = 'licensing_portal_oauth_resume_inflight';

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

function clearOAuthResumeQuery(): void {
  window.history.replaceState({}, '', window.location.pathname);
  try {
    sessionStorage.removeItem(PN_OAUTH_RESUME_SEARCH_KEY);
    sessionStorage.removeItem(STORAGE_RESUME_INFLIGHT);
  } catch {
    /* ignore */
  }
}

export interface LicensingUserInfo {
  sub?: string;
  did?: string;
  pn_identifier?: string;
}

async function tryRefreshAccessToken(): Promise<string | null> {
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

function getAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const t = sessionStorage.getItem(STORAGE_ACCESS);
  return t && t.trim() ? t.trim() : null;
}

function initialLoadingSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (isOAuthResumeUrl()) return true;
  return Boolean(getAccessToken());
}

export function clearLicensingSession(): void {
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
  sessionStorage.removeItem(STORAGE_OAUTH_CTX);
  sessionStorage.removeItem(STORAGE_POPUP_STATE);
  sessionStorage.removeItem(STORAGE_PROCESSED_CODE);
}

interface LicensingSessionValue {
  token: string | null;
  user: LicensingUserInfo | null;
  loadingSession: boolean;
  signedIn: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  authHeaders: () => HeadersInit;
  authHeadersAsync: () => Promise<HeadersInit>;
  handleBeforeUnlock: (state: string, nonce: string) => void;
  onPopupResult: (r: PnOAuthPopupResult) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const LicensingSessionContext = createContext<LicensingSessionValue | null>(null);

export function LicensingSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<LicensingUserInfo | null>(null);
  const [loadingSession, setLoadingSession] = useState(initialLoadingSession);
  const [error, setError] = useState<string | null>(null);
  const processedCodesRef = useRef<Set<string>>(new Set());
  const bootstrapStartedRef = useRef(false);

  const authHeaders = useCallback((): HeadersInit => {
    const t = getAccessToken();
    if (!t) return { 'Content-Type': 'application/json' };
    return ownerCloudHeaders({
      authToken: t,
      pnIdentifier: user?.pn_identifier,
      extra: { 'Content-Type': 'application/json' }
    });
  }, [user?.pn_identifier]);

  const authHeadersAsync = useCallback(async (): Promise<HeadersInit> => {
    const t = getAccessToken();
    if (!t) return { 'Content-Type': 'application/json' };
    return ownerCloudHeadersAsync({
      authToken: t,
      pnIdentifier: user?.pn_identifier,
      apiEndpoint: API_ENDPOINT,
      extra: { 'Content-Type': 'application/json' }
    });
  }, [user?.pn_identifier]);

  const refreshUser = useCallback(async () => {
    let t = getAccessToken();
    if (!t) {
      setUser(null);
      setToken(null);
      return;
    }
    setToken((prev) => (prev === t ? prev : t));
    try {
      let res = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.status === 401) {
        const next = await tryRefreshAccessToken();
        if (next) {
          setToken(next);
          res = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
            headers: { Authorization: `Bearer ${next}` }
          });
        }
      }
      if (res.status === 401) {
        clearLicensingSession();
        setUser(null);
        setToken(null);
        return;
      }
      if (res.ok) {
        setUser((await res.json()) as LicensingUserInfo);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const completeOAuth = useCallback(async (result: PnOAuthPopupResult) => {
    if (result.error) {
      setError(result.error_description || result.error);
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    if (!result.code) return;

    const codeKey = result.code.trim();
    if (
      processedCodesRef.current.has(codeKey) ||
      sessionStorage.getItem(STORAGE_PROCESSED_CODE) === codeKey
    ) {
      return;
    }
    processedCodesRef.current.add(codeKey);
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
    const expectedState = sessionStorage.getItem(STORAGE_POPUP_STATE) || ctx.state;
    if (result.state !== undefined && expectedState && !oauthStatesMatch(result.state, expectedState)) {
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
    if (result.granted_data_points !== undefined) {
      body.granted_data_points = result.granted_data_points;
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
    if (data.access_token) sessionStorage.setItem(STORAGE_ACCESS, data.access_token);
    if (data.refresh_token) sessionStorage.setItem(STORAGE_REFRESH, data.refresh_token);
    sessionStorage.removeItem(STORAGE_OAUTH_CTX);
    sessionStorage.removeItem(STORAGE_POPUP_STATE);
    sessionStorage.setItem(STORAGE_PROCESSED_CODE, codeKey);
    setToken(data.access_token ?? null);
    setError(null);
  }, []);

  /** OAuth return via opener navigation (?oauth_resume=1). Only when URL is a resume URL. */
  useEffect(() => {
    const params = getOAuthResumeSearchParams();
    if (!params || params.get('oauth_resume') !== '1') return;

    if (sessionStorage.getItem(STORAGE_RESUME_INFLIGHT) === '1') return;
    sessionStorage.setItem(STORAGE_RESUME_INFLIGHT, '1');

    const resume: PnOAuthPopupResult = {
      code: params.get('code') || undefined,
      state: params.get('state') || undefined,
      error: params.get('error') || undefined,
      error_description: params.get('error_description') || undefined,
      granted_data_points: params.get('granted_data_points') ?? undefined
    };

    void (async () => {
      try {
        setLoadingSession(true);
        await completeOAuth(resume);
        await refreshUser();
      } finally {
        setLoadingSession(false);
        clearOAuthResumeQuery();
      }
    })();
  }, [completeOAuth, refreshUser]);

  /** Normal landing: validate stored session once; no oauth_resume on plain `/`. */
  useEffect(() => {
    if (isOAuthResumeUrl()) return;
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;

    try {
      sessionStorage.removeItem(STORAGE_RESUME_INFLIGHT);
    } catch {
      /* ignore */
    }

    const qErr = new URLSearchParams(window.location.search).get('error');
    if (qErr) {
      setError(decodeURIComponent(qErr.replace(/\+/g, ' ')));
      window.history.replaceState({}, '', window.location.pathname);
    }

    void (async () => {
      if (getAccessToken()) {
        setLoadingSession(true);
        await refreshUser();
      }
      setLoadingSession(false);
    })();
  }, [refreshUser]);

  const handleBeforeUnlock = useCallback((state: string, nonce: string) => {
    setError(null);
    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    sessionStorage.setItem(
      STORAGE_OAUTH_CTX,
      JSON.stringify({ api: API_ENDPOINT, clientId: PN_CLIENT_ID, state, nonce, redirectUri })
    );
    sessionStorage.setItem(STORAGE_POPUP_STATE, state);
  }, []);

  const onPopupResult = useCallback(
    async (r: PnOAuthPopupResult) => {
      setLoadingSession(true);
      try {
        await completeOAuth(r);
        await refreshUser();
      } finally {
        setLoadingSession(false);
      }
    },
    [completeOAuth, refreshUser]
  );

  const signOut = useCallback(async () => {
    try {
      const { wipeThirdPartyCloudOnLock } = await import('@par-noir/oauth-ui');
      await wipeThirdPartyCloudOnLock(user?.pn_identifier);
    } catch {
      /* ignore */
    }
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
    clearLicensingSession();
    processedCodesRef.current.clear();
    setToken(null);
    setUser(null);
    setError(null);
    setLoadingSession(false);
  }, [user?.pn_identifier]);

  const signedIn = Boolean(token) && !loadingSession;

  const value = useMemo<LicensingSessionValue>(
    () => ({
      token,
      user,
      loadingSession,
      signedIn,
      error,
      setError,
      authHeaders,
      authHeadersAsync,
      handleBeforeUnlock,
      onPopupResult,
      signOut,
      refreshUser
    }),
    [
      token,
      user,
      loadingSession,
      signedIn,
      error,
      authHeaders,
      authHeadersAsync,
      handleBeforeUnlock,
      onPopupResult,
      signOut,
      refreshUser
    ]
  );

  return (
    <LicensingSessionContext.Provider value={value}>{children}</LicensingSessionContext.Provider>
  );
}

export function useLicensingSession(): LicensingSessionValue {
  const ctx = useContext(LicensingSessionContext);
  if (!ctx) throw new Error('useLicensingSession must be used within LicensingSessionProvider');
  return ctx;
}
