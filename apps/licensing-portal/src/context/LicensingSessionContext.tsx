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
  oauthStatesMatch,
  createPnSession,
  exchangePortalAuthorizationCode,
  fetchPortalUserInfo,
  setPendingGrant,
  usePnSession,
  wipeThirdPartyCloudOnLock,
  type PnOAuthPopupResult,
  type PortalTokenResponse
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/client';

const STORAGE_OAUTH_CTX = 'licensing_portal_oauth_ctx';
const STORAGE_POPUP_STATE = 'pn_oauth_state';
/** Prevents double token exchange (popup + opener nav race). */
const STORAGE_PROCESSED_CODE = 'licensing_portal_oauth_code_done';
/** Cross-mount guard while oauth_resume exchange runs. */
const STORAGE_RESUME_INFLIGHT = 'licensing_portal_oauth_resume_inflight';

export const licensingSession = createPnSession({
  clientId: PN_CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: 'licensing_portal_session'
});

licensingSession.onWipe(async () => {
  await wipeThirdPartyCloudOnLock(licensingSession.load()?.pnIdentifier).catch(() => undefined);
  sessionStorage.removeItem(STORAGE_OAUTH_CTX);
  sessionStorage.removeItem(STORAGE_POPUP_STATE);
  sessionStorage.removeItem(STORAGE_PROCESSED_CODE);
});

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

function getAccessToken(): string | null {
  return licensingSession.load()?.accessToken ?? null;
}

function initialLoadingSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (isOAuthResumeUrl()) return true;
  return Boolean(getAccessToken());
}

interface LicensingSessionValue {
  token: string | null;
  user: LicensingUserInfo | null;
  loadingSession: boolean;
  signedIn: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  authHeadersAsync: () => Promise<HeadersInit>;
  handleBeforeUnlock: (state: string, nonce: string) => void;
  onPopupResult: (r: PnOAuthPopupResult) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const LicensingSessionContext = createContext<LicensingSessionValue | null>(null);

export function LicensingSessionProvider({ children }: { children: ReactNode }) {
  const session = usePnSession(licensingSession);
  const token = session?.accessToken ?? null;
  const [user, setUser] = useState<LicensingUserInfo | null>(null);
  const [loadingSession, setLoadingSession] = useState(initialLoadingSession);
  const [error, setError] = useState<string | null>(null);
  const processedCodesRef = useRef<Set<string>>(new Set());
  const bootstrapStartedRef = useRef(false);

  // Bearer only. Music registry tracks are Postgres-backed and do not resolve
  // owner Drive. Do not invent a sync cloud-header helper for this surface.
  const authHeadersAsync = useCallback(async (): Promise<HeadersInit> => {
    const t = getAccessToken();
    if (!t) return { 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
  }, []);

  const refreshUser = useCallback(async () => {
    let t = await licensingSession.getAccessToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      let res = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.status === 401) {
        t = await licensingSession.getAccessToken({ forceRefresh: true });
        if (!t) return;
        res = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${t}` }
        });
      }
      setUser(res.ok ? ((await res.json()) as LicensingUserInfo) : null);
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
    let data: PortalTokenResponse;
    let info: LicensingUserInfo;
    try {
      data = await exchangePortalAuthorizationCode({
        apiEndpoint: API_ENDPOINT,
        clientId: ctx.clientId || PN_CLIENT_ID,
        code: result.code,
        redirectUri: ctx.redirectUri,
        grantedDataPoints:
          typeof result.granted_data_points === 'string'
            ? result.granted_data_points.split(',').filter(Boolean)
            : undefined
      });
      info = (await fetchPortalUserInfo({
        apiEndpoint: API_ENDPOINT,
        accessToken: data.access_token
      })) as LicensingUserInfo;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token exchange failed');
      sessionStorage.removeItem(STORAGE_POPUP_STATE);
      return;
    }
    licensingSession.begin(data, { pnIdentifier: info.pn_identifier || info.sub || 'unknown' });
    setUser(info);
    if (typeof result.granted_data_points === 'string' && result.consent_shown === '1') {
      setPendingGrant(
        ctx.clientId || PN_CLIENT_ID,
        result.granted_data_points.split(',').filter(Boolean)
      );
    }
    sessionStorage.removeItem(STORAGE_OAUTH_CTX);
    sessionStorage.removeItem(STORAGE_POPUP_STATE);
    sessionStorage.setItem(STORAGE_PROCESSED_CODE, codeKey);
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
      granted_data_points: params.get('granted_data_points') ?? undefined,
      consent_shown: params.get('consent_shown') === '1' ? '1' : undefined
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

  const signOut = useCallback(() => licensingSession.lock('manual'), []);

  const signedIn = Boolean(token) && !loadingSession;

  const value = useMemo<LicensingSessionValue>(
    () => ({
      token,
      user,
      loadingSession,
      signedIn,
      error,
      setError,
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
