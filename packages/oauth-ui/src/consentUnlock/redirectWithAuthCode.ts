/**
 * Redirect / postMessage handoff after OAuth code mint (RFC 6749).
 */

import {
  buildMessagingHandoffFromUnlock,
  buildMessagingIdentityHash,
  buildMessagingSessionWindowName,
  handoffProvidesMessagingSession,
  type MessagingOAuthHandoffPayload,
} from '../messagingOAuthHandoff';
import { PN_OAUTH_MESSAGE_TYPE } from '../pnOAuthPopup';
import { isMessagingHandoffClient } from './constants';

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
  /** Optional external open (Capacitor Browser) when leaving the unlock WebView. */
  openExternal?: (url: string) => void | Promise<void>;
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
  identityHash?: string
): string {
  const u = new URL(redirectUri);
  u.searchParams.set('code', code);
  if (state) u.searchParams.set('state', state);
  if (grantedDataPoints.length) {
    u.searchParams.set('granted_data_points', grantedDataPoints.join(','));
  }
  if (consentShown) u.searchParams.set('consent_shown', '1');
  if (popupFlow) u.searchParams.set('pn_popup', '1');
  if (identityHash) {
    u.hash = identityHash.startsWith('#') ? identityHash.slice(1) : identityHash;
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
    openExternal,
  } = args;

  let messagingHandoff: MessagingOAuthHandoffPayload | null = null;
  let identityHash: string | undefined;

  if (isMessagingHandoffClient(clientId)) {
    messagingHandoff = buildMessagingHandoffFromUnlock(encryptedIdentity, decryptedIdentity);
    if (!messagingHandoff || !handoffProvidesMessagingSession(messagingHandoff)) {
      throw new Error(
        'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
      );
    }
    if (messagingHandoff.session) {
      try {
        window.name = buildMessagingSessionWindowName(messagingHandoff.session, messagingHandoff.timestamp);
      } catch {
        /* ignore */
      }
    }
    if (messagingHandoff.identity) {
      identityHash = buildMessagingIdentityHash(messagingHandoff.identity, messagingHandoff.timestamp);
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
    granted_data_points: grantedDataPoints.join(',') || undefined,
    consent_shown: consentShown ? '1' : undefined,
    timestamp: Date.now(),
  };
  if (messagingHandoff) {
    callbackPayload.messagingHandoff = messagingHandoff;
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
    identityHash
  );

  if (openExternal) {
    await openExternal(targetUrl);
    return;
  }

  if (popupFlow && resolveOpener()) {
    setTimeout(() => {
      try {
        window.close();
      } catch {
        window.location.href = targetUrl;
      }
    }, 400);
    window.location.href = targetUrl;
    return;
  }

  window.location.href = targetUrl;
}

export function denyOAuthConsent(args: {
  redirectUri: string;
  state: string;
  popupFlow: boolean;
  openExternal?: (url: string) => void | Promise<void>;
}): void {
  const { redirectUri, state, popupFlow, openExternal } = args;
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
