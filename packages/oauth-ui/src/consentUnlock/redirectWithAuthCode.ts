/**
 * Redirect / postMessage handoff after OAuth code mint (RFC 6749).
 */

import {
  buildMessagingHandoffFromUnlock,
  buildMessagingHandoffHash,
  buildMessagingIdentityHash,
  buildMessagingSessionWindowName,
  handoffProvidesMessagingSession,
  type MessagingOAuthHandoffPayload,
} from '../messagingOAuthHandoff';
import { PN_OAUTH_MESSAGE_TYPE } from '../pnOAuthPopup';
import { isMessagingHandoffClient, OAUTH_BROKER_COMPLETE_PATH } from './constants';

export type RedirectWithAuthCodeArgs = {
  code: string;
  redirectUri: string;
  state: string;
  popupFlow: boolean;
  clientId: string;
  grantedDataPoints: string[];
  consentShown: boolean;
  encryptedIdentity?: unknown;
  decryptedIdentity?: unknown;
  /** Optional external open (Capacitor Browser / Electron) when leaving the unlock WebView. */
  openExternal?: (url: string) => void | Promise<void>;
  /**
   * Prefer-app desktop: deliver full payload (incl. messaging handoff) via API broker
   * so browse can poll without loopback / openExternal URL limits.
   */
  deliverLocalBroker?: (payload: Record<string, unknown>) => void | Promise<void>;
  /** API base for broker-complete when deliverLocalBroker is not provided. */
  apiEndpoint?: string;
};

function resolveOpener(): Window | null {
  try {
    if (typeof window === 'undefined') return null;
    if (window.opener && !window.opener.closed) return window.opener as Window;
  } catch {
    /* ignore */
  }
  return null;
}

function buildCallbackUrl(
  redirectUri: string,
  code: string,
  state: string,
  grantedDataPoints: string[],
  consentShown: boolean,
  popupFlow: boolean,
  hashPayload?: string
): string {
  const u = new URL(redirectUri);
  u.searchParams.set('code', code);
  if (state) u.searchParams.set('state', state);
  if (grantedDataPoints.length) {
    u.searchParams.set('granted_data_points', grantedDataPoints.join(','));
  }
  if (consentShown) u.searchParams.set('consent_shown', '1');
  if (popupFlow) u.searchParams.set('pn_popup', '1');
  if (hashPayload) {
    u.hash = hashPayload.startsWith('#') ? hashPayload.slice(1) : hashPayload;
  }
  return u.toString();
}

function postOAuthCallback(
  appOrigin: string,
  payload: Record<string, unknown>
): void {
  const opener = resolveOpener();
  if (opener && appOrigin) {
    try {
      opener.postMessage(payload, appOrigin);
    } catch {
      /* ignore */
    }
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel('par-noir-oauth-v1');
      ch.postMessage(payload);
      ch.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Deliver authorization code to the caller (postMessage burst + redirect).
 */
export async function redirectWithAuthCode(args: RedirectWithAuthCodeArgs): Promise<void> {
  const {
    code,
    redirectUri,
    state,
    popupFlow,
    clientId,
    grantedDataPoints,
    consentShown,
    encryptedIdentity,
    decryptedIdentity,
    openExternal: openExternalArg,
    deliverLocalBroker: deliverLocalBrokerArg,
  } = args;
  // Cap / prefer-app (!popup): broker (or openExternal) is the sole transport.
  // Web popup: still redirect to oauth-callback for the auth code. Chrome clears
  // window.name on cross-site navigations and COOP severs opener postMessage, so
  // ML-KEM/ML-DSA session must also ride the API broker when Unlock wires it.
  const openExternal = popupFlow ? undefined : openExternalArg;
  const brokerOnly = !popupFlow && Boolean(deliverLocalBrokerArg);

  let messagingHandoff: MessagingOAuthHandoffPayload | null = null;
  let hashPayload: string | undefined;

  if (isMessagingHandoffClient(clientId)) {
    messagingHandoff = buildMessagingHandoffFromUnlock(encryptedIdentity, decryptedIdentity);
    if (!messagingHandoff || !handoffProvidesMessagingSession(messagingHandoff)) {
      throw new Error(
        'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
      );
    }
    // Local broker carries the full payload (no URL length limit). openExternal
    // hash is session-only so OS URL limits are not blown.
    const crossProcess =
      Boolean(openExternal) ||
      brokerOnly ||
      (!popupFlow && !resolveOpener());
    if (brokerOnly) {
      // Full handoff goes in the broker payload below — no hash needed.
    } else if (crossProcess && openExternal) {
      if (!messagingHandoff.session) {
        throw new Error(
          'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
        );
      }
      // Size-aware: hash may strip ML-DSA; window.name still carries the full session
      // when the broker can set it. postMessage below always includes the full handoff.
      try {
        window.name = buildMessagingSessionWindowName(
          messagingHandoff.session,
          messagingHandoff.timestamp
        );
      } catch {
        /* ignore */
      }
      hashPayload = buildMessagingHandoffHash({
        v: 1,
        timestamp: messagingHandoff.timestamp,
        session: messagingHandoff.session,
      });
    } else if (!crossProcess) {
      if (messagingHandoff.session) {
        try {
          window.name = buildMessagingSessionWindowName(
            messagingHandoff.session,
            messagingHandoff.timestamp
          );
        } catch {
          /* ignore */
        }
      }
      if (messagingHandoff.identity) {
        hashPayload = buildMessagingIdentityHash(
          messagingHandoff.identity,
          messagingHandoff.timestamp
        );
      }
    } else if (crossProcess) {
      if (!messagingHandoff.session) {
        throw new Error(
          'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
        );
      }
      hashPayload = buildMessagingHandoffHash({
        v: 1,
        timestamp: messagingHandoff.timestamp,
        session: messagingHandoff.session,
      });
    }
  }

  let appOrigin = '';
  try {
    appOrigin = new URL(redirectUri).origin;
  } catch {
    /* ignore */
  }

  const callbackPayload: Record<string, unknown> = {
    type: PN_OAUTH_MESSAGE_TYPE,
    code,
    state: state || undefined,
    client_id: clientId,
    granted_data_points: grantedDataPoints.join(',') || undefined,
    consent_shown: consentShown ? '1' : undefined,
    timestamp: Date.now(),
  };
  if (messagingHandoff) {
    callbackPayload.messagingHandoff = messagingHandoff;
  }

  // Broker before postMessage: Pen may exchange the code as soon as the first
  // opener message arrives; storeBrokerPending requires a still-live code.
  if (deliverLocalBrokerArg) {
    try {
      await deliverLocalBrokerArg(callbackPayload);
    } catch {
      if (brokerOnly) throw new Error('Broker handoff failed');
      // Popup supplemental: still redirect / postMessage so web unlock completes.
    }
    if (brokerOnly) return;
  }

  const burst = () => postOAuthCallback(appOrigin, callbackPayload);
  burst();
  [50, 150, 300].forEach((ms) => setTimeout(burst, ms));

  const targetUrl = buildCallbackUrl(
    redirectUri,
    code,
    state,
    grantedDataPoints,
    consentShown,
    popupFlow,
    hashPayload
  );

  if (openExternal) {
    await openExternal(targetUrl);
    return;
  }

  if (popupFlow && resolveOpener()) {
    // Do not window.close() here — that races oauth-callback.html load/stash/postMessage
    // (historically closed at 400ms and dropped ML-DSA handoff). Callback closes itself.
    window.location.href = targetUrl;
    return;
  }

  window.location.href = targetUrl;
}

export function denyOAuthConsent(args: {
  redirectUri: string;
  state: string;
  popupFlow: boolean;
  clientId?: string;
  openExternal?: (url: string) => void | Promise<void>;
  deliverLocalBroker?: (payload: Record<string, unknown>) => void | Promise<void>;
}): void {
  const { redirectUri, state, popupFlow, clientId } = args;
  const deliverLocalBroker = popupFlow ? undefined : args.deliverLocalBroker;
  const openExternal = popupFlow ? undefined : args.openExternal;
  const denyPayload: Record<string, unknown> = {
    type: PN_OAUTH_MESSAGE_TYPE,
    error: 'access_denied',
    error_description: 'User denied access',
    state: state || undefined,
    client_id: clientId,
    timestamp: Date.now(),
  };
  if (deliverLocalBroker) {
    void Promise.resolve(deliverLocalBroker(denyPayload)).catch(() => {
      /* browse will time out */
    });
    return;
  }
  let appOrigin = '';
  try {
    appOrigin = new URL(redirectUri).origin;
  } catch {
    /* ignore */
  }
  const opener = resolveOpener();
  if (opener && appOrigin) {
    try {
      opener.postMessage(
        {
          type: PN_OAUTH_MESSAGE_TYPE,
          error: 'access_denied',
          error_description: 'User denied access',
        },
        appOrigin
      );
      window.close();
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    const du = new URL(redirectUri);
    du.searchParams.set('error', 'access_denied');
    du.searchParams.set('error_description', 'User denied access');
    if (state) du.searchParams.set('state', state);
    if (popupFlow) du.searchParams.set('pn_popup', '1');
    const target = du.toString();
    if (openExternal) {
      void openExternal(target);
      return;
    }
    window.location.href = target;
  } catch {
    const sep = redirectUri.includes('?') ? '&' : '?';
    let q =
      'error=access_denied&error_description=' +
      encodeURIComponent('User denied access') +
      (state ? '&state=' + encodeURIComponent(state) : '');
    if (popupFlow) q += '&pn_popup=1';
    const target = redirectUri + sep + q;
    if (openExternal) {
      void openExternal(target);
      return;
    }
    window.location.href = target;
  }
}

/** POST prefer-app result to API so browse can poll (all browsers). */
export async function postOAuthBrokerComplete(
  apiEndpoint: string,
  payload: Record<string, unknown>
): Promise<void> {
  const base = apiEndpoint.replace(/\/$/, '');
  const res = await fetch(`${base}${OAUTH_BROKER_COMPLETE_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    mode: 'cors',
    credentials: 'omit',
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error_description?: string };
      detail = j.error_description || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Broker complete failed (${res.status})`);
  }
}
