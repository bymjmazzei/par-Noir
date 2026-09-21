/** First-party apps that also receive ML-KEM messaging handoff after unlock. */
export const MESSAGING_HANDOFF_CLIENT_IDS = ['browser-app', 'messaging-app'] as const;

export type MessagingHandoffClientId = (typeof MESSAGING_HANDOFF_CLIENT_IDS)[number];

export function isMessagingHandoffClient(clientId: string): boolean {
  return (MESSAGING_HANDOFF_CLIENT_IDS as readonly string[]).includes(clientId);
}

/** Production hosted unlock broker (web + Universal/App Links). */
export const DEFAULT_UNLOCK_ORIGIN = 'https://unlock.parnoir.com';

/** Capacitor / store app id for the unlock broker. */
export const UNLOCK_APP_ID = 'com.parnoir.unlock';

export const UNLOCK_CUSTOM_SCHEME = 'com.parnoir.unlock';

/** Cap Messages — return target after prefer-app broker-complete. */
export const MESSAGING_CUSTOM_SCHEME = 'com.parnoir.messaging';

/** Cap Browse — return target after prefer-app broker-complete. */
export const BROWSE_CUSTOM_SCHEME = 'com.parnoir.browser';

/**
 * Prefer-app Unlock → browse handoff via API (works in all browsers).
 * Unlock POSTs complete; browse GETs pending by OAuth state.
 */
export const OAUTH_BROKER_COMPLETE_PATH = '/oauth/authorize/broker-complete';
export const OAUTH_BROKER_PENDING_PATH = '/oauth/authorize/broker-pending';

/**
 * Cap custom-scheme resume URL for the OAuth caller after Unlock broker-complete.
 * Prefer-app opens Unlock as a separate process; Cap Browser.close is a no-op then —
 * Unlock must App.openUrl this so the caller can resume broker-pending polling.
 */
export function callerCapAppResumeUrl(args: {
  clientId?: string | null;
  redirectUri?: string | null;
}): string | null {
  const clientId = (args.clientId || '').trim();
  if (clientId === 'messaging-app') {
    return `${MESSAGING_CUSTOM_SCHEME}://oauth/resume`;
  }
  if (clientId === 'browser-app') {
    return `${BROWSE_CUSTOM_SCHEME}://oauth/resume`;
  }
  const redirectUri = (args.redirectUri || '').trim();
  if (!redirectUri) return null;
  try {
    const host = new URL(redirectUri).hostname.toLowerCase();
    if (host === 'messaging.parnoir.com' || host.startsWith('messaging.')) {
      return `${MESSAGING_CUSTOM_SCHEME}://oauth/resume`;
    }
    if (host === 'browse.parnoir.com' || host.startsWith('browse.')) {
      return `${BROWSE_CUSTOM_SCHEME}://oauth/resume`;
    }
  } catch {
    /* ignore */
  }
  return null;
}
