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
   * Prefer **false** for web + API popup-bridge: the bridge postMessages the opener; resolving here runs
   * token exchange in the same document. Use **true** only for hosts that intentionally complete OAuth
   * from a fresh load (e.g. full-window / native) and do not await the Promise after.
   */
  completeViaParentNavigation?: boolean;
}

function coerceOAuthString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function parseOAuthPayload(raw: Record<string, unknown>): PnOAuthPopupResult | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type !== PN_OAUTH_MESSAGE_TYPE) return null;
  const code = coerceOAuthString(raw.code);
  const state = coerceOAuthString(raw.state);
  const err = coerceOAuthString(raw.error);
  const errDesc = coerceOAuthString(raw.error_description);
  const age = coerceOAuthString(raw.age_shared);
  return {
    code: code !== undefined && code.length > 0 ? code : undefined,
    state: state !== undefined ? state : undefined,
    error: err !== undefined && err.length > 0 ? err : undefined,
    error_description: errDesc !== undefined && errDesc.length > 0 ? errDesc : undefined,
    age_shared: age !== undefined && age.length > 0 ? age : undefined,
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

  /** Consent + popup-bridge live on the API host; postMessage always comes from that origin. */
  let oauthFlowApiOrigin = '';
  try {
    oauthFlowApiOrigin = new URL(url).origin;
  } catch {
    /* ignore */
  }

  const isAllowedOrigin = (eventOrigin: string) =>
    eventOrigin === origin ||
    allowedMessageOrigins.some((a) => a === eventOrigin) ||
    (oauthFlowApiOrigin !== '' && eventOrigin === oauthFlowApiOrigin);

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
        if (incoming === undefined) {
          fail(new Error('OAUTH_STATE_MISSING'));
          return;
        }
        if (!oauthStatesMatch(incoming, expectedState)) {
          fail(new Error('OAUTH_STATE_MISMATCH'));
          return;
        }
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
      const key = event.key;
      if (!key || !event.newValue) return;
      // oauth-callback.html uses pn_oauth_callback_<timestamp>, not a fixed key
      if (!key.startsWith('pn_oauth_callback_')) return;
      try {
        const data = JSON.parse(event.newValue) as Record<string, unknown>;
        acceptPayload(data);
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
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
