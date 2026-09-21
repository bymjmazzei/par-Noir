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

/**
 * Desktop Unlock (Electron) loopback — browse polls this when prefer-app opens the app.
 * Bound to 127.0.0.1 only; result is set via IPC, never via HTTP write.
 */
export const UNLOCK_DESKTOP_BROKER_PORT = 47823;
export const UNLOCK_DESKTOP_BROKER_ORIGIN = `http://127.0.0.1:${UNLOCK_DESKTOP_BROKER_PORT}`;
export const UNLOCK_DESKTOP_BROKER_PENDING_PATH = '/oauth-broker/pending';
