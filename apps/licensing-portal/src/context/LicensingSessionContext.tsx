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
import { PN_OAUTH_RESUME_SEARCH_KEY, type PnOAuthPopupResult } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/client';

const STORAGE_ACCESS = 'licensing_portal_access_token';
const STORAGE_REFRESH = 'licensing_portal_refresh_token';
const STORAGE_OAUTH_CTX = 'licensing_portal_oauth_ctx';
const STORAGE_POPUP_STATE = 'pn_oauth_state';
/** Prevents double token exchange (Strict Mode, popup + opener nav race). */
const STORAGE_PROCESSED_CODE = 'licensing_portal_oauth_code_done';

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
  handleBeforeUnlock: (state: string, nonce: string) => void;
  onPopupResult: (r: PnOAuthPopupResult) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const LicensingSessionContext = createContext<LicensingSessionValue | null>(null);

export function LicensingSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<LicensingUserInfo | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const oauthResumeStartedRef = useRef(false);
  const processedCodesRef = useRef<Set<string>>(new Set());

  const authHeaders = useCallback((): HeadersInit => {
    const t = getAccessToken();
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (t) (h as Record<string, string>)['Authorization'] = `Bearer ${t}`;
    return h;
  }, []);

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
    if (data.access_token) sessionStorage.setItem(STORAGE_ACCESS, data.access_token);
    if (data.refresh_token) sessionStorage.setItem(STORAGE_REFRESH, data.refresh_token);
    sessionStorage.removeItem(STORAGE_OAUTH_CTX);
    sessionStorage.removeItem(STORAGE_POPUP_STATE);
    sessionStorage.setItem(STORAGE_PROCESSED_CODE, codeKey);
    setToken(data.access_token ?? null);
    setError(null);
  }, []);

  useEffect(() => {
    const storedSearch = sessionStorage.getItem(PN_OAUTH_RESUME_SEARCH_KEY);
    const search = storedSearch ?? window.location.search;
    const params = new URLSearchParams(search);

    if (params.get('oauth_resume') === '1') {
      if (oauthResumeStartedRef.current) return;
      oauthResumeStartedRef.current = true;

      const resume: PnOAuthPopupResult = {
        code: params.get('code') || undefined,
        state: params.get('state') || undefined,
        error: params.get('error') || undefined,
        error_description: params.get('error_description') || undefined,
        age_shared: params.get('age_shared') || undefined
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
      return;
    }

    const qErr = params.get('error');
    if (qErr) {
      setError(decodeURIComponent(qErr.replace(/\+/g, ' ')));
      clearOAuthResumeQuery();
    }
    void (async () => {
      setLoadingSession(true);
      await refreshUser();
      setLoadingSession(false);
    })();
  }, [completeOAuth, refreshUser]);

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
      await completeOAuth(r);
      await refreshUser();
    },
    [completeOAuth, refreshUser]
  );

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
    clearLicensingSession();
    sessionStorage.removeItem(STORAGE_PROCESSED_CODE);
    processedCodesRef.current.clear();
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

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
