import { pushPnOAuthDebug } from './pnOAuthDebug';

/**
 * Shared pN OAuth popup flow. Must stay in sync with static oauth-callback.html
 * (apps/aggregator-browser/public/oauth-callback.html and copies in other apps).
 *
 * After consent, the API redirects the popup to the registered redirect_uri (RFC 6749) — typically
 * oauth-callback.html on the **same origin** as the opener. Handoff uses postMessage from that
 * origin, BroadcastChannel (par-noir-oauth-v1), and same-origin localStorage polling when opener
 * is missing.
 *
 * Contract:
 * - Callback page posts message: { type: 'oauth_callback', code?, state?, error?, age_shared?, timestamp? }
 * - Callback page sets localStorage: pn_oauth_pending, pn_oauth_latest_key, pn_oauth_callback_<ts>
 * - With pn_popup=1 (API adds this when authorize uses popup=true): the callback must NOT navigate the
 *   opener away first — only postMessage/BroadcastChannel/storage — so the opener can resolve
 *   startPnOAuthPopup. Third-party integrators should use the same authorize URL shape as buildOAuthConsentUrl.
 * - With pn_popup=1, callback may close without loading the SPA when opener is missing.
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
   * Extra origins to accept postMessage from (optional). Default is `origin` (the app that opened
   * the popup); OAuth completion messages normally come from the same origin as the static callback page.
   */
  allowedMessageOrigins?: string[];
  timeoutMs?: number;
  popupName?: string;
  popupFeatures?: string;
  /**
   * When true, navigate this window to `/?oauth_resume=1&code=...` instead of resolving the Promise.
   * Prefer **false** for web popups so token exchange runs in the same document after postMessage.
   * Use **true** for full-window / native flows that complete OAuth from a fresh load.
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

/** Compare OAuth state values (handles minor encoding differences across redirects). */
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

function readLatestOAuthStoragePayloadDirect(): Record<string, unknown> | null {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pn_oauth_callback_')) keys.push(key);
    }
    if (keys.length === 0) return null;
    keys.sort((a, b) => {
      const at = Number(a.replace('pn_oauth_callback_', ''));
      const bt = Number(b.replace('pn_oauth_callback_', ''));
      return bt - at;
    });
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;
      const ts = Number((data as { timestamp?: unknown }).timestamp);
      if (Number.isFinite(ts) && Date.now() - ts > 120_000) continue;
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Drop leftover bridge keys so a new flow does not immediately consume a stale callback. */
function clearStaleOAuthBridgeKeys(): void {
  try {
    localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
    localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pn_oauth_callback_')) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function defaultPopupName(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `pn-oauth-${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `pn-oauth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    popupName = defaultPopupName(),
    popupFeatures = DEFAULT_POPUP_FEATURES,
    completeViaParentNavigation = false,
  } = options;

  const isAllowedOrigin = (eventOrigin: string) =>
    eventOrigin === origin || allowedMessageOrigins.some((a) => a === eventOrigin);

  return new Promise((resolve, reject) => {
    pushPnOAuthDebug('popup_flow_start', {
      completeViaParentNavigation,
      expectedStateEmpty: expectedState === '',
    });
    const popup = window.open(url, popupName, popupFeatures);
    if (!popup) {
      pushPnOAuthDebug('popup_blocked', {});
      reject(new Error('POPUP_BLOCKED'));
      return;
    }

    clearStaleOAuthBridgeKeys();

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
      window.removeEventListener('message', onMessage, true);
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
      pushPnOAuthDebug('popup_reject', { reason: err.message });
      reject(err);
    };

    const acceptPayload = (raw: Record<string, unknown>, source: string) => {
      const parsed = parseOAuthPayload(raw);
      if (!parsed) {
        pushPnOAuthDebug('popup_payload_skip', { source, reason: 'not_oauth_callback' });
        return;
      }
      if (!parsed.code && !parsed.error) {
        pushPnOAuthDebug('popup_payload_skip', { source, reason: 'no_code_no_error' });
        return;
      }

      pushPnOAuthDebug('popup_payload_ok', {
        source,
        hasCode: Boolean(parsed.code),
        hasError: Boolean(parsed.error),
      });

      // CSRF: when we sent a non-empty state, require a match (payload or sessionStorage fallback).
      // Silent mismatch used to block navigation entirely — parent never unlocked with no error.
      if (expectedState !== '') {
        const incoming = resolveIncomingOAuthState(parsed);
        if (incoming === undefined) {
          pushPnOAuthDebug('popup_state_fail', { source, reason: 'OAUTH_STATE_MISSING' });
          fail(new Error('OAUTH_STATE_MISSING'));
          return;
        }
        if (!oauthStatesMatch(incoming, expectedState)) {
          pushPnOAuthDebug('popup_state_fail', { source, reason: 'OAUTH_STATE_MISMATCH' });
          fail(new Error('OAUTH_STATE_MISMATCH'));
          return;
        }
      }

      if (completeViaParentNavigation) {
        if (settled) return;
        settled = true;
        disposeAwait();
        pushPnOAuthDebug('popup_parent_nav', { source });
        window.location.replace(buildOAuthResumeUrl(origin, parsed));
        return;
      }
      pushPnOAuthDebug('popup_finish', { source });
      finish(parsed);
    };

    /** oauth-callback.html may call opener.location.replace(/?oauth_resume=1&code=...) before postMessage is observed. */
    const tryAcceptFromOpenerUrl = () => {
      if (settled) return;
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('oauth_resume') !== '1') return;
        const raw: Record<string, unknown> = {
          type: PN_OAUTH_MESSAGE_TYPE,
          code: sp.get('code') ?? undefined,
          state: sp.get('state') ?? undefined,
          error: sp.get('error') ?? undefined,
          error_description: sp.get('error_description') ?? undefined,
          age_shared: sp.get('age_shared') ?? undefined,
          timestamp: Date.now(),
        };
        acceptPayload(raw, 'opener_url');
      } catch {
        /* ignore */
      }
    };

    try {
      oauthBc = new BroadcastChannel(PN_OAUTH_BROADCAST_CHANNEL);
      oauthBc.onmessage = (ev: MessageEvent) => {
        if (!ev.data || typeof ev.data !== 'object') return;
        acceptPayload(ev.data as Record<string, unknown>, 'broadcast');
      };
    } catch {
      /* private mode / unsupported */
    }

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      acceptPayload(data as Record<string, unknown>, 'postMessage');
    };

    const onStorage = (event: StorageEvent) => {
      const key = event.key;
      if (!key || !event.newValue) return;
      // oauth-callback.html uses pn_oauth_callback_<timestamp>, not a fixed key
      if (!key.startsWith('pn_oauth_callback_')) return;
      try {
        const data = JSON.parse(event.newValue) as Record<string, unknown>;
        acceptPayload(data, 'storage');
      } catch {
        /* ignore */
      }
    };

    // Capture phase: some embeds / timing edge cases deliver message after microtasks; capture runs first.
    window.addEventListener('message', onMessage, true);
    window.addEventListener('storage', onStorage);

    const pollStorageOnce = () => {
      if (settled) return;
      tryAcceptFromOpenerUrl();
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
                acceptPayload(data, 'poll');
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (settled) return;
      try {
        const direct = readLatestOAuthStoragePayloadDirect();
        if (direct) {
          acceptPayload(direct, 'poll_scan');
        }
      } catch {
        /* ignore */
      }
    };

    queueMicrotask(() => pollStorageOnce());
    pollInterval = setInterval(pollStorageOnce, 50);

    // Wait longer after popup closes before failing: callback defers window.close() so parent can
    // still receive postMessage / BroadcastChannel / poll localStorage in slow browsers.
    const POPUP_CLOSED_GRACE_MS = 8000;
    checkClosedInterval = setInterval(() => {
      if (settled) return;
      tryAcceptFromOpenerUrl();
      if (settled) return;
      try {
        if (popup.closed) {
          if (popupClosedTime === null) popupClosedTime = Date.now();
          else if (Date.now() - popupClosedTime > POPUP_CLOSED_GRACE_MS) {
            tryAcceptFromOpenerUrl();
            if (!settled) fail(new Error('POPUP_CLOSED'));
          }
        } else {
          // Cross-origin OAuth navigations can briefly report closed; reset so we only fail after
          // a sustained closed period while the window was previously observable as open.
          popupClosedTime = null;
        }
      } catch {
        /* COOP may throw */
      }
    }, 500);

    timeoutId = setTimeout(() => {
      if (!settled) {
        pushPnOAuthDebug('popup_timeout', {});
        fail(new Error('POPUP_TIMEOUT'));
      }
    }, timeoutMs);
  });
}
