import { pushPnOAuthDebug } from './pnOAuthDebug';
import { handoffProvidesMessagingSession, PN_MESSAGING_OAUTH_HANDOFF_STORAGE } from './messagingOAuthHandoff';

/**
 * Shared pN OAuth popup flow. Must stay in sync with static oauth-callback.html
 * (apps/aggregator-browser/public/oauth-callback.html and copies in other apps).
 *
 * After consent, the API redirects the popup to the registered redirect_uri (RFC 6749) — typically
 * oauth-callback.html on the **same origin** as the opener. Handoff uses postMessage from that
 * Handoff uses postMessage from that origin, BroadcastChannel (par-noir-oauth-v1), same-origin
 * localStorage polling, and named-window navigation (PN_OAUTH_OPENER_WINDOW_NAME) when opener is lost.
 *
 * Contract:
 * - Callback page posts message: { type: 'oauth_callback', code?, state?, error?, granted_data_points?, timestamp? }
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
/**
 * Opener window.name for oauth-callback.html named-window fallback when window.opener is null
 * (noopener / COOP after cross-origin consent). Must match static oauth-callback.html.
 */
export const PN_OAUTH_OPENER_WINDOW_NAME = 'parnoir_oauth_parent_v1';

export interface OAuthConsentUrlConfig {
  clientId: string;
  apiEndpoint: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
  /** When true (default), adds popup=true so API consent knows to close/popup UX */
  forPopup?: boolean;
  /** Force identity unlock on consent even when OAuth permissions already exist */
  identityHandoffRequired?: boolean;
}

export interface PnOAuthPopupResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  /** Comma-separated data point ids the user chose to share at consent. */
  granted_data_points?: string;
  /** ML-KEM session + encrypted identity from consent (same unlock as OAuth code). */
  messagingHandoff?: Record<string, unknown>;
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
  if (config.identityHandoffRequired) {
    params.set('identity_handoff', 'required');
  }

  const base = config.apiEndpoint.replace(/\/$/, '');
  return `${base}/oauth/authorize/consent?${params.toString()}`;
}

/** browser-app / messaging: same-origin unlock page (not API consent). */
export interface BrowserAppOAuthUnlockUrlConfig {
  clientId: string;
  appOrigin: string;
  redirectUri: string;
  /** Passed to oauth-authorize.html for POST /oauth/authorize/authenticate */
  apiEndpoint?: string;
  scope?: string[];
  state?: string;
  nonce?: string;
  forPopup?: boolean;
  identityHandoffRequired?: boolean;
}

export function buildBrowserAppOAuthUnlockUrl(config: BrowserAppOAuthUnlockUrlConfig): string {
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
  if (config.identityHandoffRequired) {
    params.set('identity_handoff', 'required');
  }
  if (config.apiEndpoint) {
    params.set('api_endpoint', config.apiEndpoint.replace(/\/$/, ''));
  }

  const base = config.appOrigin.replace(/\/$/, '');
  return `${base}/oauth-authorize.html?${params.toString()}`;
}

/** @deprecated Use buildOAuthConsentUrl */
export function buildOAuthAuthorizeUrl(config: OAuthConsentUrlConfig): string {
  return buildOAuthConsentUrl(config);
}

/** popup=yes helps some browsers keep window.opener for cross-origin OAuth flows */
const DEFAULT_POPUP_FEATURES = 'popup=yes,width=500,height=600,scrollbars=yes,resizable=yes';

export const MESSAGING_HANDOFF_INCOMPLETE = 'MESSAGING_HANDOFF_INCOMPLETE' as const;

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
  /** When true, do not resolve until messagingHandoff is valid or isMessagingReady() returns true. */
  requireMessagingHandoff?: boolean;
  /** Check whether messaging keys landed (e.g. after handoff applied from storage). */
  isMessagingReady?: () => boolean;
  /** Max wait for messaging handoff when requireMessagingHandoff (default 8000). */
  messagingHandoffTimeoutMs?: number;
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
  const granted = coerceOAuthString(raw.granted_data_points);
  const messagingHandoff =
    raw.messagingHandoff && typeof raw.messagingHandoff === 'object'
      ? (raw.messagingHandoff as Record<string, unknown>)
      : undefined;
  return {
    code: code !== undefined && code.length > 0 ? code : undefined,
    state: state !== undefined ? state : undefined,
    error: err !== undefined && err.length > 0 ? err : undefined,
    error_description: errDesc !== undefined && errDesc.length > 0 ? errDesc : undefined,
    granted_data_points: granted !== undefined ? granted : undefined,
    messagingHandoff,
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
  if (parsed.granted_data_points !== undefined) {
    p.set('granted_data_points', parsed.granted_data_points);
  }
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
    requireMessagingHandoff = false,
    isMessagingReady,
    messagingHandoffTimeoutMs = 8_000,
  } = options;

  const isAllowedOrigin = (eventOrigin: string) =>
    eventOrigin === origin || allowedMessageOrigins.some((a) => a === eventOrigin);

  const messagingHandoffSatisfied = (parsed: PnOAuthPopupResult): boolean => {
    if (!requireMessagingHandoff || parsed.error) return true;
    try {
      if (isMessagingReady?.()) return true;
    } catch {
      /* ignore */
    }
    return handoffProvidesMessagingSession(parsed.messagingHandoff);
  };

  return new Promise((resolve, reject) => {
    pushPnOAuthDebug('popup_flow_start', {
      completeViaParentNavigation,
      expectedStateEmpty: expectedState === '',
      requireMessagingHandoff,
    });
    // Named window lets oauth-callback.html navigate this tab when window.opener is lost.
    try {
      if (!window.name) {
        window.name = PN_OAUTH_OPENER_WINDOW_NAME;
      }
    } catch {
      /* ignore */
    }

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
    /** Until true, ignore popup.closed — cross-origin OAuth can report closed until the popup reaches same-origin callback. */
    let popupEverSeenOpen = false;

    let oauthBc: BroadcastChannel | undefined;
    let pendingOAuthResult: PnOAuthPopupResult | null = null;
    let messagingHandoffWaitStarted: number | null = null;

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

    const tryFinishWithMessaging = (parsed: PnOAuthPopupResult, source: string) => {
      if (messagingHandoffSatisfied(parsed)) {
        pushPnOAuthDebug('popup_finish', {
          source,
          hasMessagingHandoff: Boolean(parsed.messagingHandoff),
        });
        finish(parsed);
        return true;
      }
      pendingOAuthResult = parsed;
      if (messagingHandoffWaitStarted === null) {
        messagingHandoffWaitStarted = Date.now();
      }
      pushPnOAuthDebug('popup_wait_messaging_handoff', {
        source,
        hasMessagingHandoff: Boolean(parsed.messagingHandoff),
      });
      return false;
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
        hasMessagingHandoff: Boolean(parsed.messagingHandoff),
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

      if (parsed.error) {
        pushPnOAuthDebug('popup_finish', { source, isError: true });
        finish(parsed);
        return;
      }

      tryFinishWithMessaging(parsed, source);
    };

    const pollMessagingHandoffReady = () => {
      if (settled || !pendingOAuthResult) return;
      if (messagingHandoffSatisfied(pendingOAuthResult)) {
        tryFinishWithMessaging(pendingOAuthResult, 'messaging_poll');
        return;
      }
      if (
        messagingHandoffWaitStarted !== null &&
        Date.now() - messagingHandoffWaitStarted > messagingHandoffTimeoutMs
      ) {
        fail(new Error(MESSAGING_HANDOFF_INCOMPLETE));
      }
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
          granted_data_points: sp.get('granted_data_points') ?? undefined,
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
      if (key.startsWith('pn_oauth_callback_')) {
        try {
          const data = JSON.parse(event.newValue) as Record<string, unknown>;
          acceptPayload(data, 'storage');
        } catch {
          /* ignore */
        }
        return;
      }
      // Messaging handoff may land after oauth code when popup is already closing.
      if (key === PN_MESSAGING_OAUTH_HANDOFF_STORAGE && pendingOAuthResult?.code) {
        pollMessagingHandoffReady();
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
    pollInterval = setInterval(() => {
      pollStorageOnce();
      pollMessagingHandoffReady();
    }, 50);

    // Wait after popup closes before failing: callback defers window.close() so parent can still
    // receive postMessage / BroadcastChannel / poll localStorage in slow browsers.
    const POPUP_CLOSED_GRACE_MS = 25_000;
    checkClosedInterval = setInterval(() => {
      if (settled) return;
      tryAcceptFromOpenerUrl();
      if (settled) return;
      pollMessagingHandoffReady();
      try {
        if (!popup.closed) {
          popupEverSeenOpen = true;
          popupClosedTime = null;
          return;
        }
        // closed === true
        if (!popupEverSeenOpen) {
          // Do not treat as user cancel: during API consent the opener often sees closed===true
          // until the redirect hits same-origin oauth-callback.html.
          return;
        }
        if (popupClosedTime === null) popupClosedTime = Date.now();
        else if (Date.now() - popupClosedTime > POPUP_CLOSED_GRACE_MS) {
          tryAcceptFromOpenerUrl();
          pollStorageOnce();
          if (pendingOAuthResult?.code) {
            if (messagingHandoffSatisfied(pendingOAuthResult)) {
              finish(pendingOAuthResult);
              return;
            }
            if (requireMessagingHandoff) {
              fail(new Error(MESSAGING_HANDOFF_INCOMPLETE));
              return;
            }
          }
          if (!settled) fail(new Error('POPUP_CLOSED'));
        }
      } catch {
        /* COOP may throw when reading popup.closed during cross-origin navigation */
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
