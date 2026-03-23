/**
 * Shared pN OAuth popup flow. Must stay in sync with static oauth-callback.html
 * (apps/aggregator-browser/public/oauth-callback.html and copies in other apps).
 * Callback must not navigate window.opener. Uses postMessage, BroadcastChannel (par-noir-oauth-v1),
 * and same-origin localStorage polling.
 *
 * Contract:
 * - Callback page posts message: { type: 'oauth_callback', code?, state?, error?, age_shared?, timestamp? }
 * - Callback page sets localStorage: pn_oauth_pending, pn_oauth_latest_key, pn_oauth_callback_<ts>
 * - With pn_popup=1 from API, callback must not load the SPA in the popup when opener is missing.
 */

export const PN_OAUTH_MESSAGE_TYPE = 'oauth_callback' as const;
export const PN_OAUTH_STORAGE_PENDING = 'pn_oauth_pending';
export const PN_OAUTH_STORAGE_LATEST_KEY = 'pn_oauth_latest_key';
/** Same-origin bridge when the popup loses window.opener after cross-origin redirects (must match static oauth-callback.html). */
export const PN_OAUTH_BROADCAST_CHANNEL = 'par-noir-oauth-v1';

export interface OAuthConsentUrlConfig {
  clientId: string;
  apiEndpoint: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
  /** When true (default), adds popup=true so API consent knows to close/popup UX */
  forPopup?: boolean;
}

export interface PnOAuthPopupResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  age_shared?: string;
}

function generateRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build authorize URL to API /oauth/authorize/consent (redirects to /oauth/consent).
 */
export function buildOAuthConsentUrl(config: OAuthConsentUrlConfig): string {
  const state = config.state ?? generateRandomHex(16);
  const nonce = config.nonce ?? generateRandomHex(16);
  const scope = (config.scope ?? ['openid', 'profile']).join(' ');
  const forPopup = config.forPopup !== false;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope,
    state,
    nonce,
  });
  if (forPopup) {
    params.set('popup', 'true');
  }

  const base = config.apiEndpoint.replace(/\/$/, '');
  return `${base}/oauth/authorize/consent?${params.toString()}`;
}

/** @deprecated Use buildOAuthConsentUrl */
export function buildOAuthAuthorizeUrl(config: OAuthConsentUrlConfig): string {
  return buildOAuthConsentUrl(config);
}

/** popup=yes helps some browsers keep window.opener for cross-origin OAuth flows */
const DEFAULT_POPUP_FEATURES = 'popup=yes,width=500,height=600,scrollbars=yes,resizable=yes';

export interface StartPnOAuthPopupOptions {
  url: string;
  expectedState: string;
  /** Opener origin for postMessage validation (default window.location.origin) */
  origin?: string;
  /**
   * Additional origins to accept postMessage from. Required when using the API popup-bridge:
   * the bridge runs on the API host and sends messages from that origin, not the app origin.
   * Pass the API base URL origin, e.g. new URL(API_ENDPOINT).origin.
   */
  allowedMessageOrigins?: string[];
  timeoutMs?: number;
  popupName?: string;
  popupFeatures?: string;
  /**
   * When true, navigate this window to `/?oauth_resume=1&code=...` instead of resolving the Promise.
   * Use when the host app completes OAuth from the URL on load (e.g. useAuthAndSession). Required for
   * reliable completion if storage/BroadcastChannel cannot bridge the popup to this document.
   */
  completeViaParentNavigation?: boolean;
}

function parseOAuthPayload(raw: Record<string, unknown>): PnOAuthPopupResult | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type !== PN_OAUTH_MESSAGE_TYPE) return null;
  return {
    code: typeof raw.code === 'string' ? raw.code : undefined,
    state: typeof raw.state === 'string' ? raw.state : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    error_description: typeof raw.error_description === 'string' ? raw.error_description : undefined,
    age_shared: typeof raw.age_shared === 'string' ? raw.age_shared : undefined,
  };
}

function buildOAuthResumeUrl(pageOrigin: string, parsed: PnOAuthPopupResult): string {
  const base = pageOrigin.replace(/\/$/, '');
  const p = new URLSearchParams();
  p.set('oauth_resume', '1');
  if (parsed.code) p.set('code', parsed.code);
  if (parsed.state) p.set('state', parsed.state);
  if (parsed.error) p.set('error', parsed.error);
  if (parsed.error_description) p.set('error_description', parsed.error_description);
  if (parsed.age_shared) p.set('age_shared', parsed.age_shared);
  return `${base}/?${p.toString()}`;
}

/** Compare OAuth state values (handles minor encoding differences across bridge/callback). */
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

function resolveIncomingOAuthState(parsed: PnOAuthPopupResult): string | undefined {
  if (parsed.state !== undefined) return parsed.state;
  try {
    const fromSession = sessionStorage.getItem('pn_oauth_state');
    return fromSession && fromSession.length > 0 ? fromSession : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opens consent URL in a popup and resolves when oauth_callback is received
 * (postMessage, BroadcastChannel, or localStorage poll).
 */
export function startPnOAuthPopup(options: StartPnOAuthPopupOptions): Promise<PnOAuthPopupResult> {
  const {
    url,
    expectedState,
    origin = typeof window !== 'undefined' ? window.location.origin : '',
    allowedMessageOrigins = [],
    timeoutMs = 300_000,
    popupName = 'pn-oauth',
    popupFeatures = DEFAULT_POPUP_FEATURES,
    completeViaParentNavigation = false,
  } = options;

  const isAllowedOrigin = (eventOrigin: string) =>
    eventOrigin === origin || allowedMessageOrigins.some((a) => a === eventOrigin);

  return new Promise((resolve, reject) => {
    const popup = window.open(url, popupName, popupFeatures);
    if (!popup) {
      reject(new Error('POPUP_BLOCKED'));
      return;
    }

    let settled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let checkClosedInterval: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let popupClosedTime: number | null = null;

    let oauthBc: BroadcastChannel | undefined;

    const closeOauthBc = () => {
      try {
        oauthBc?.close();
      } catch {
        /* ignore */
      }
      oauthBc = undefined;
    };

    const disposeAwait = () => {
      closeOauthBc();
      if (pollInterval !== undefined) clearInterval(pollInterval);
      if (checkClosedInterval !== undefined) clearInterval(checkClosedInterval);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      try {
        localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
        localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
      } catch {
        /* ignore */
      }
    };

    const finish = (result: PnOAuthPopupResult) => {
      if (settled) return;
      settled = true;
      disposeAwait();
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      disposeAwait();
      reject(err);
    };

    const acceptPayload = (raw: Record<string, unknown>) => {
      const parsed = parseOAuthPayload(raw);
      if (!parsed) return;
      if (!parsed.code && !parsed.error) return;

      // CSRF: when we sent a non-empty state, require a match (payload or sessionStorage fallback).
      // Silent mismatch used to block navigation entirely — parent never unlocked with no error.
      if (expectedState !== '') {
        const incoming = resolveIncomingOAuthState(parsed);
        if (incoming === undefined) return;
        if (!oauthStatesMatch(incoming, expectedState)) return;
      }

      if (completeViaParentNavigation) {
        if (settled) return;
        settled = true;
        disposeAwait();
        window.location.replace(buildOAuthResumeUrl(origin, parsed));
        return;
      }
      finish(parsed);
    };

    try {
      oauthBc = new BroadcastChannel(PN_OAUTH_BROADCAST_CHANNEL);
      oauthBc.onmessage = (ev: MessageEvent) => {
        if (!ev.data || typeof ev.data !== 'object') return;
        acceptPayload(ev.data as Record<string, unknown>);
      };
    } catch {
      /* private mode / unsupported */
    }

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      acceptPayload(data as Record<string, unknown>);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pn_oauth_callback' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue) as Record<string, unknown>;
          acceptPayload(data);
        } catch {
          /* ignore */
        }
        try {
          localStorage.removeItem('pn_oauth_callback');
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);

    pollInterval = setInterval(() => {
      if (settled) return;
      try {
        const pending = localStorage.getItem(PN_OAUTH_STORAGE_PENDING);
        const latestKey = localStorage.getItem(PN_OAUTH_STORAGE_LATEST_KEY);
        if (pending === 'true' && latestKey) {
          const stored = localStorage.getItem(latestKey);
          if (stored) {
            try {
              const data = JSON.parse(stored) as Record<string, unknown>;
              const ts = Number(data.timestamp);
              const age = Number.isFinite(ts) ? Date.now() - ts : 0;
              if (Number.isFinite(ts) && age < 120_000) {
                try {
                  localStorage.removeItem(latestKey);
                } catch {
                  /* ignore */
                }
                acceptPayload(data);
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }, 50);

    checkClosedInterval = setInterval(() => {
      if (settled) return;
      try {
        if (popup.closed) {
          if (popupClosedTime === null) popupClosedTime = Date.now();
          else if (Date.now() - popupClosedTime > 3000) {
            fail(new Error('POPUP_CLOSED'));
          }
        }
      } catch {
        /* COOP may throw */
      }
    }, 500);

    timeoutId = setTimeout(() => {
      if (!settled) fail(new Error('POPUP_TIMEOUT'));
    }, timeoutMs);
  });
}
